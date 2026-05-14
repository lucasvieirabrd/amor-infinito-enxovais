import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { db } from '../database';
import { sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export interface ReportParams {
  status: 'all' | 'overdue' | 'today' | 'current' | 'paid';
  customerId?: string;
  startDate?: string;
  endDate?: string;
  outputFormat: 'pdf' | 'excel';
}

// --- Formatters ---

function brl(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function fmtDate(date: Date | string | null): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

function fmtPhone(rawPhone: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  return local.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') || rawPhone;
}

function escHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function installmentStatusLabel(status: string, dueDateRaw: Date | string): string {
  if (status === 'paid') return '✅ Paga';
  if (status === 'canceled') return '❌ Cancelada';
  const due = new Date(dueDateRaw);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return '❌ Atrasada';
  if (due.getTime() === today.getTime()) return '⏳ Vence hoje';
  return '⏳ Pendente';
}

function installmentStatusClass(status: string, dueDateRaw: Date | string): string {
  if (status === 'paid') return 'status-paid';
  const due = new Date(dueDateRaw);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return 'status-overdue';
  return 'status-pending';
}

// --- Logo ---

const possibleLogoPaths = [
  path.join(__dirname, '../assets/logo-amor-infinito.jpeg'),
  path.join(__dirname, '../../src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'dist/assets/logo-amor-infinito.jpeg'),
];
let logoSrc = '';
for (const p of possibleLogoPaths) {
  if (fs.existsSync(p)) {
    logoSrc = `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
    break;
  }
}
const logoFallbackSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40">',
  '<text x="1" y="30" font-family="Arial,sans-serif" font-size="30" fill="#e53e3e">&#x2665;</text>',
  '<text x="40" y="18" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#be123c">AMOR INFINITO</text>',
  '<text x="40" y="33" font-family="Arial,sans-serif" font-size="9" fill="#888" letter-spacing="1">ENXOVAIS</text>',
  '</svg>',
].join('');
const logoFallbackSrc = `data:image/svg+xml;base64,${Buffer.from(logoFallbackSvg).toString('base64')}`;

// --- Types ---

interface RawRow {
  customer_id: string;
  customer_name: string;
  cpf: string | null;
  customer_phone: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  sale_id: string;
  sale_number: string;
  sale_date: Date | string;
  total_amount: string;
  installments_count: number | null;
  products_text: string | null;
  installment_id: string;
  installment_number: number;
  due_date: Date | string;
  original_amount: string;
  paid_amount: string | null;
  payment_date: Date | string | null;
  installment_status: string;
}

interface InstallmentData {
  id: string;
  number: number;
  dueDate: Date | string;
  amount: number;
  paidAmount: number;
  paymentDate: Date | string | null;
  status: string;
}

interface SaleData {
  id: string;
  number: string;
  date: Date | string;
  totalAmount: number;
  installmentsCount: number;
  products: string;
  installments: InstallmentData[];
}

interface CustomerData {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  address: string;
  sales: SaleData[];
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
}

// --- Data Fetching ---

async function fetchReportData(params: ReportParams): Promise<CustomerData[]> {
  const statusCond =
    params.status === 'overdue'
      ? sql`AND (i.status IN ('pending', 'overdue') AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))`
      : params.status === 'today'
      ? sql`AND (i.status NOT IN ('paid', 'canceled') AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))`
      : params.status === 'current'
      ? sql`AND (i.status = 'pending' AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) > DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))`
      : params.status === 'paid'
      ? sql`AND i.status = 'paid'`
      : sql``;

  const customerCond = params.customerId
    ? sql`AND i.customer_id = ${params.customerId}`
    : sql``;

  const startCond = params.startDate
    ? sql`AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) >= ${params.startDate}`
    : sql``;

  const endCond = params.endDate
    ? sql`AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) <= ${params.endDate}`
    : sql``;

  const [rows] = await db.execute(sql`
    SELECT
      c.id                  AS customer_id,
      c.name                AS customer_name,
      c.cpf,
      c.phone               AS customer_phone,
      c.address_street,
      c.address_number,
      c.address_neighborhood,
      c.address_city,
      c.address_state,
      s.id                  AS sale_id,
      s.sale_number,
      s.sale_date,
      s.total_amount,
      s.installments_count,
      (
        SELECT GROUP_CONCAT(
          CONCAT(p.name, ' ', si.quantity, 'x')
          ORDER BY p.name SEPARATOR ' | '
        )
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = s.id
      )                     AS products_text,
      i.id                  AS installment_id,
      i.installment_number,
      i.due_date,
      i.original_amount,
      i.paid_amount,
      i.payment_date,
      i.status              AS installment_status
    FROM installments i
    JOIN customers c ON i.customer_id = c.id AND c.deleted_at IS NULL
    JOIN sales s ON i.sale_id = s.id AND s.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
      ${statusCond}
      ${customerCond}
      ${startCond}
      ${endCond}
    ORDER BY c.name ASC, s.sale_date ASC, i.installment_number ASC
  `);

  const rawRows = rows as RawRow[];
  const customersMap = new Map<string, CustomerData>();

  for (const row of rawRows) {
    if (!customersMap.has(row.customer_id)) {
      const addressParts = [
        row.address_street,
        row.address_number,
        row.address_neighborhood,
        row.address_city,
        row.address_state,
      ].filter(Boolean);

      customersMap.set(row.customer_id, {
        id: row.customer_id,
        name: row.customer_name,
        cpf: row.cpf || '',
        phone: row.customer_phone || '',
        address: addressParts.join(', '),
        sales: [],
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
      });
    }

    const customer = customersMap.get(row.customer_id)!;

    let sale = customer.sales.find(s => s.id === row.sale_id);
    if (!sale) {
      sale = {
        id: row.sale_id,
        number: row.sale_number,
        date: row.sale_date,
        totalAmount: Number(row.total_amount),
        installmentsCount: row.installments_count || 0,
        products: row.products_text || 'N/D',
        installments: [],
      };
      customer.sales.push(sale);
    }

    const instAmount = Number(row.original_amount);
    const instPaid = Number(row.paid_amount || 0);

    sale.installments.push({
      id: row.installment_id,
      number: row.installment_number,
      dueDate: row.due_date,
      amount: instAmount,
      paidAmount: instPaid,
      paymentDate: row.payment_date,
      status: row.installment_status,
    });

    if (row.installment_status === 'paid') {
      customer.totalPaid += instAmount;
    } else {
      const due = new Date(row.due_date);
      due.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) {
        customer.totalOverdue += instAmount - instPaid;
      } else {
        customer.totalPending += instAmount - instPaid;
      }
    }
  }

  return [...customersMap.values()];
}

// --- PDF ---

export async function generateCreditReportPdf(params: ReportParams): Promise<Buffer> {
  const customers = await fetchReportData(params);

  const totalCustomers = customers.length;
  const totalPaid = customers.reduce((s, c) => s + c.totalPaid, 0);
  const totalPending = customers.reduce((s, c) => s + c.totalPending, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.totalOverdue, 0);

  const customersHtml = customers.map(c => `
    <div class="customer-section">
      <div class="customer-header">
        <div class="customer-name">${escHtml(c.name)}</div>
        <div class="customer-meta">
          CPF: ${escHtml(c.cpf || 'N/D')}
          &nbsp;|&nbsp;
          Tel: ${escHtml(fmtPhone(c.phone))}
          ${c.address ? `&nbsp;|&nbsp; ${escHtml(c.address)}` : ''}
        </div>
      </div>
      <div class="customer-body">
        ${c.sales.map(s => `
          <div class="sale-block">
            <div class="sale-header">
              <div>
                <span class="sale-number">${escHtml(s.number)}</span>
                <span class="sale-meta">&nbsp;— ${fmtDate(s.date)}</span>
              </div>
              <div class="sale-meta">
                Total: ${brl(s.totalAmount)}
                ${s.installmentsCount > 1 ? ` &nbsp;(${s.installmentsCount}x de ${brl(s.totalAmount / s.installmentsCount)})` : ''}
              </div>
            </div>
            <div class="sale-products">Produtos: ${escHtml(s.products)}</div>
            <table class="installments-table">
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pago em</th>
                </tr>
              </thead>
              <tbody>
                ${s.installments.map(i => `
                  <tr>
                    <td>${i.number === 0 ? 'Entrada' : i.number}</td>
                    <td>${fmtDate(i.dueDate)}</td>
                    <td>${brl(i.amount)}</td>
                    <td class="${installmentStatusClass(i.status, i.dueDate)}">${installmentStatusLabel(i.status, i.dueDate)}</td>
                    <td>${i.paymentDate ? fmtDate(i.paymentDate) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        <div class="customer-footer">
          <div class="footer-item">
            <div class="footer-label">Total Pago</div>
            <div class="footer-value footer-paid">${brl(c.totalPaid)}</div>
          </div>
          <div class="footer-item">
            <div class="footer-label">Em Aberto</div>
            <div class="footer-value footer-pending">${brl(c.totalPending)}</div>
          </div>
          ${c.totalOverdue > 0 ? `
          <div class="footer-item">
            <div class="footer-label">Inadimplente</div>
            <div class="footer-value footer-overdue">${brl(c.totalOverdue)}</div>
          </div>` : ''}
        </div>
      </div>
    </div>
  `).join('');

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm");

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; padding: 20px; }
    .report-header { text-align: center; border-bottom: 2px solid #be123c; padding-bottom: 16px; margin-bottom: 20px; }
    .logo { height: 48px; margin-bottom: 8px; }
    .report-title { font-size: 17px; font-weight: bold; color: #be123c; margin: 4px 0; }
    .report-subtitle { font-size: 11px; color: #666; margin-top: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
    .summary-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 14px; font-weight: bold; margin-top: 3px; }
    .customer-section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; break-inside: avoid; }
    .customer-header { background: #be123c; color: white; padding: 10px 14px; }
    .customer-name { font-size: 13px; font-weight: bold; }
    .customer-meta { font-size: 10px; opacity: 0.85; margin-top: 3px; }
    .customer-body { padding: 12px 14px; }
    .sale-block { margin-bottom: 12px; border: 1px solid #f1f5f9; border-radius: 6px; overflow: hidden; }
    .sale-block:last-of-type { margin-bottom: 8px; }
    .sale-header { background: #f8fafc; padding: 7px 10px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .sale-number { font-weight: bold; color: #374151; font-size: 11px; }
    .sale-meta { font-size: 10px; color: #6b7280; }
    .sale-products { padding: 5px 10px; font-size: 10px; color: #4b5563; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
    .installments-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .installments-table th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e2e8f0; }
    .installments-table td { padding: 5px 8px; border-bottom: 1px solid #f8fafc; color: #4b5563; }
    .installments-table tr:last-child td { border-bottom: none; }
    .status-paid { color: #16a34a; font-weight: 600; }
    .status-overdue { color: #dc2626; font-weight: 600; }
    .status-pending { color: #d97706; font-weight: 600; }
    .customer-footer { display: flex; gap: 16px; margin-top: 10px; padding: 8px 10px; background: #f8fafc; border-radius: 6px; }
    .footer-item { flex: 1; }
    .footer-label { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer-value { font-weight: bold; font-size: 12px; margin-top: 2px; }
    .footer-paid { color: #16a34a; }
    .footer-pending { color: #d97706; }
    .footer-overdue { color: #dc2626; }
    .page-footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="report-header">
    <img class="logo" src="${logoSrc || logoFallbackSrc}" alt="Logo">
    <div class="report-title">RELATÓRIO DE CREDIÁRIO</div>
    <div class="report-subtitle">AMOR INFINITO ENXOVAIS</div>
    <div class="report-subtitle">Gerado em ${generatedAt}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total de Clientes</div>
      <div class="summary-value" style="color:#374151">${totalCustomers}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total em Aberto</div>
      <div class="summary-value" style="color:#d97706">${brl(totalPending)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Pago</div>
      <div class="summary-value" style="color:#16a34a">${brl(totalPaid)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Inadimplente</div>
      <div class="summary-value" style="color:#dc2626">${brl(totalOverdue)}</div>
    </div>
  </div>

  ${customersHtml.length ? customersHtml : '<p style="text-align:center;color:#6b7280;padding:40px 0">Nenhum registro encontrado para os filtros selecionados.</p>'}

  <div class="page-footer">
    Amor Infinito Enxovais — Relatório gerado automaticamente em ${generatedAt}
  </div>
</body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// --- Excel ---

export async function generateCreditReportExcel(params: ReportParams): Promise<Buffer> {
  const customers = await fetchReportData(params);

  const headerRow = [
    'Nome Cliente', 'CPF', 'Telefone', 'Endereço',
    'Número Venda', 'Data Venda', 'Produtos', 'Total Venda',
    'Nº Parcela', 'Vencimento', 'Valor Parcela', 'Status', 'Data Pagamento',
  ];

  const dataRows: (string | number)[][] = [];
  for (const c of customers) {
    for (const s of c.sales) {
      for (const i of s.installments) {
        dataRows.push([
          c.name,
          c.cpf,
          fmtPhone(c.phone),
          c.address,
          s.number,
          fmtDate(s.date),
          s.products,
          Number(s.totalAmount),
          i.number === 0 ? 'Entrada' : i.number,
          fmtDate(i.dueDate),
          Number(i.amount),
          installmentStatusLabel(i.status, i.dueDate).replace(/✅|⏳|❌/g, '').trim(),
          i.paymentDate ? fmtDate(i.paymentDate) : '',
        ]);
      }
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 16 }, { wch: 40 },
    { wch: 14 }, { wch: 13 }, { wch: 40 }, { wch: 14 },
    { wch: 10 }, { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Crediário');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
