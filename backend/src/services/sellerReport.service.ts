import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { db } from '../database';
import { sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export interface SellerReportParams {
  startDate: string;
  endDate: string;
  sellerId?: string;
  commissionPercent: number;
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
  } catch { return ''; }
}

function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

interface RawSaleRow {
  seller_id: string | null;
  seller_name: string | null;
  sale_id: string;
  sale_number: string;
  sale_date: Date | string;
  customer_name: string;
  total_amount: string;
}

interface SellerSale {
  id: string;
  number: string;
  date: Date | string;
  customerName: string;
  totalAmount: number;
  commission: number;
}

interface SellerData {
  id: string | null;
  name: string;
  sales: SellerSale[];
  totalAmount: number;
  totalCommission: number;
}

// --- Data Fetching ---

async function fetchData(params: SellerReportParams): Promise<SellerData[]> {
  const sellerCond = params.sellerId
    ? sql`AND s.seller_id = ${params.sellerId}`
    : sql``;

  const [rows] = await db.execute(sql`
    SELECT
      s.seller_id,
      sel.name     AS seller_name,
      s.id         AS sale_id,
      s.sale_number,
      s.sale_date,
      c.name       AS customer_name,
      s.total_amount
    FROM sales s
    LEFT JOIN sellers sel ON s.seller_id = sel.id
    JOIN customers c ON s.customer_id = c.id AND c.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
      AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) >= ${params.startDate}
      AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) <= ${params.endDate}
      ${sellerCond}
    ORDER BY (s.seller_id IS NULL) ASC, sel.name ASC, s.sale_date ASC
  `);

  const pct = params.commissionPercent / 100;
  const sellersMap = new Map<string, SellerData>();

  for (const row of rows as RawSaleRow[]) {
    const key = row.seller_id ?? '__no_seller__';
    if (!sellersMap.has(key)) {
      sellersMap.set(key, {
        id: row.seller_id,
        name: row.seller_name ?? 'Sem vendedor',
        sales: [],
        totalAmount: 0,
        totalCommission: 0,
      });
    }

    const seller = sellersMap.get(key)!;
    const amount = Number(row.total_amount);
    const commission = amount * pct;

    seller.sales.push({
      id: row.sale_id,
      number: row.sale_number,
      date: row.sale_date,
      customerName: row.customer_name,
      totalAmount: amount,
      commission,
    });

    seller.totalAmount += amount;
    seller.totalCommission += commission;
  }

  return [...sellersMap.values()];
}

// --- PDF ---

export async function generateSellerReportPdf(params: SellerReportParams): Promise<Buffer> {
  const sellers = await fetchData(params);

  const grandTotal = sellers.reduce((s, v) => s + v.totalAmount, 0);
  const grandCommission = sellers.reduce((s, v) => s + v.totalCommission, 0);
  const grandCount = sellers.reduce((s, v) => s + v.sales.length, 0);
  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  const pctLabel = `${params.commissionPercent}%`;

  const sellersHtml = sellers.map(seller => `
    <div class="seller-section">
      <div class="seller-header">
        <div class="seller-name">${esc(seller.name)}</div>
        <div class="seller-summary">
          ${seller.sales.length} venda${seller.sales.length !== 1 ? 's' : ''}
          &nbsp;|&nbsp; Total: ${brl(seller.totalAmount)}
          &nbsp;|&nbsp; Comissão (${pctLabel}): ${brl(seller.totalCommission)}
        </div>
      </div>
      <div class="seller-body">
        <table class="sales-table">
          <thead>
            <tr>
              <th>Nº Venda</th>
              <th>Data</th>
              <th>Cliente</th>
              <th class="td-right">Valor Total</th>
              <th class="td-right">Comissão</th>
            </tr>
          </thead>
          <tbody>
            ${seller.sales.map((sale, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
                <td><strong>${esc(sale.number)}</strong></td>
                <td>${fmtDate(sale.date)}</td>
                <td>${esc(sale.customerName)}</td>
                <td class="td-right">${brl(sale.totalAmount)}</td>
                <td class="td-right commission">${brl(sale.commission)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="seller-footer">
          <div class="footer-item">
            <div class="footer-label">Subtotal Vendido</div>
            <div class="footer-value">${brl(seller.totalAmount)}</div>
          </div>
          <div class="footer-item">
            <div class="footer-label">Comissão Total (${pctLabel})</div>
            <div class="footer-value commission">${brl(seller.totalCommission)}</div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; padding: 20px; }
    .report-header { text-align: center; border-bottom: 2px solid #be123c; padding-bottom: 16px; margin-bottom: 20px; }
    .logo { height: 48px; margin-bottom: 8px; }
    .report-title { font-size: 18px; font-weight: bold; color: #be123c; margin: 4px 0; letter-spacing: 1px; }
    .report-subtitle { font-size: 11px; color: #666; margin-top: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
    .summary-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 14px; font-weight: bold; margin-top: 3px; }
    .seller-section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; break-inside: avoid; }
    .seller-header { background: #be123c; color: white; padding: 10px 14px; }
    .seller-name { font-size: 13px; font-weight: bold; }
    .seller-summary { font-size: 10px; opacity: 0.9; margin-top: 3px; }
    .seller-body { padding: 12px 14px; }
    .sales-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .sales-table th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e2e8f0; }
    .sales-table td { padding: 5px 8px; border-bottom: 1px solid #f8fafc; color: #4b5563; }
    .sales-table tr:last-child td { border-bottom: none; }
    .td-right { text-align: right; }
    .commission { color: #16a34a; font-weight: bold; }
    .seller-footer { display: flex; justify-content: flex-end; gap: 24px; margin-top: 10px; padding: 8px 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
    .footer-item { text-align: right; }
    .footer-label { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer-value { font-weight: bold; font-size: 12px; margin-top: 2px; color: #be123c; }
    .footer-value.commission { color: #16a34a; }
    .grand-total { margin-top: 24px; padding: 14px 20px; background: #1f2937; color: white; border-radius: 8px; display: flex; justify-content: flex-end; gap: 32px; }
    .grand-item { text-align: right; }
    .grand-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; }
    .grand-value { font-size: 15px; font-weight: bold; margin-top: 3px; }
    .page-footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="report-header">
    <img class="logo" src="${logoSrc || logoFallbackSrc}" alt="Logo">
    <div class="report-title">RELATÓRIO DE VENDAS POR VENDEDOR</div>
    <div class="report-subtitle">AMOR INFINITO ENXOVAIS</div>
    <div class="report-subtitle">Período: ${fmtDate(params.startDate)} a ${fmtDate(params.endDate)}</div>
    <div class="report-subtitle">Comissão: ${pctLabel} sobre o valor total da venda</div>
    <div class="report-subtitle">Gerado em ${generatedAt}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total de Vendas</div>
      <div class="summary-value" style="color:#374151">${grandCount}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Vendido</div>
      <div class="summary-value" style="color:#be123c">${brl(grandTotal)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Comissões (${pctLabel})</div>
      <div class="summary-value" style="color:#16a34a">${brl(grandCommission)}</div>
    </div>
  </div>

  ${sellersHtml || '<p style="text-align:center;color:#6b7280;padding:40px 0">Nenhuma venda encontrada para o período selecionado.</p>'}

  ${sellers.length > 0 ? `
  <div class="grand-total">
    <div class="grand-item">
      <div class="grand-label">Total de Vendas</div>
      <div class="grand-value">${grandCount}</div>
    </div>
    <div class="grand-item">
      <div class="grand-label">Total Geral Vendido</div>
      <div class="grand-value">${brl(grandTotal)}</div>
    </div>
    <div class="grand-item">
      <div class="grand-label">Total Geral Comissões</div>
      <div class="grand-value" style="color:#4ade80">${brl(grandCommission)}</div>
    </div>
  </div>` : ''}

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

export async function generateSellerReportExcel(params: SellerReportParams): Promise<Buffer> {
  const sellers = await fetchData(params);
  const pctLabel = `${params.commissionPercent}%`;

  const headerRow = [
    'Vendedor', 'Nº Venda', 'Data', 'Cliente', 'Valor Total', `Comissão (${pctLabel})`,
  ];

  const dataRows: (string | number)[][] = [];
  for (const seller of sellers) {
    for (const sale of seller.sales) {
      dataRows.push([
        seller.name,
        sale.number,
        fmtDate(sale.date),
        sale.customerName,
        Number(sale.totalAmount),
        Number(sale.commission.toFixed(2)),
      ]);
    }
    dataRows.push([
      `SUBTOTAL — ${seller.name}`, '', '', '',
      Number(seller.totalAmount.toFixed(2)),
      Number(seller.totalCommission.toFixed(2)),
    ]);
    dataRows.push([]);
  }

  const grandTotal = sellers.reduce((s, v) => s + v.totalAmount, 0);
  const grandCommission = sellers.reduce((s, v) => s + v.totalCommission, 0);
  dataRows.push(['TOTAL GERAL', '', '', '', Number(grandTotal.toFixed(2)), Number(grandCommission.toFixed(2))]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  ws['!cols'] = [
    { wch: 25 }, { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 14 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Vendedores');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
