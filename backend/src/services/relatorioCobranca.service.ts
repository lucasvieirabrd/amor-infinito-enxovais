import puppeteer from 'puppeteer';
import { format, differenceInDays } from 'date-fns';
import { inArray } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { db } from '../database';
import { settings } from '../database/schema';
import { sql } from 'drizzle-orm';

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
    const logoBase64 = fs.readFileSync(p).toString('base64');
    logoSrc = `data:image/jpeg;base64,${logoBase64}`;
    break;
  }
}

// --- Formatters ---

function brl(value: number | string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value)
  );
}

function fmtDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy');
}

function fmtPhone(raw: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  return local.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function fmtAddress(row: any): string {
  const parts: string[] = [];
  const street = [row.address_street, row.address_number].filter(Boolean).join(', ');
  if (street) parts.push(street);
  if (row.address_neighborhood) parts.push(row.address_neighborhood);
  const cityState = [row.address_city, row.address_state].filter(Boolean).join(' - ');
  if (cityState) parts.push(cityState);
  return parts.join(' - ');
}

// --- Data fetch ---

interface InstallmentRow {
  id: string;
  installmentNumber: number;
  originalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: Date;
  customerName: string;
  customerPhone: string;
  address: string;
  totalInstallments: number;
  remainingCount: number;
  totalRemaining: number;
  daysOverdue: number;
}

async function fetchReportData(): Promise<{
  today: InstallmentRow[];
  overdue: InstallmentRow[];
  pixCelita: string;
  pixMarcelo: string;
  reportDate: string;
}> {
  const [rows] = await db.execute(sql`
    SELECT
      i.id,
      i.installment_number,
      i.original_amount,
      COALESCE(i.paid_amount, 0) AS paid_amount,
      i.status,
      i.due_date,
      c.name            AS customer_name,
      c.phone           AS customer_phone,
      c.address_street,
      c.address_number,
      c.address_neighborhood,
      c.address_city,
      c.address_state,
      (
        SELECT COUNT(*) FROM installments i2
        WHERE i2.sale_id = i.sale_id
          AND i2.installment_number > 0
          AND i2.deleted_at IS NULL
      ) AS total_installments,
      (
        SELECT COUNT(*) FROM installments i3
        WHERE i3.customer_id = i.customer_id
          AND i3.status IN ('pending', 'overdue', 'partial')
          AND i3.installment_number > 0
          AND i3.deleted_at IS NULL
      ) AS remaining_count,
      (
        SELECT COALESCE(SUM(i4.original_amount - COALESCE(i4.paid_amount, 0)), 0)
        FROM installments i4
        WHERE i4.customer_id = i.customer_id
          AND i4.status IN ('pending', 'overdue', 'partial')
          AND i4.installment_number > 0
          AND i4.deleted_at IS NULL
      ) AS total_remaining,
      DATEDIFF(
        DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')),
        DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00'))
      ) AS days_overdue
    FROM installments i
    INNER JOIN customers c ON i.customer_id = c.id
    WHERE i.status IN ('pending', 'overdue', 'partial')
      AND i.installment_number > 0
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00'))
          <= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
    ORDER BY
      CASE WHEN DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00'))
                = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
           THEN 0 ELSE 1 END,
      c.name ASC,
      i.due_date ASC
  `);

  const pixRows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, ['pix_celita', 'pix_marcelo']));

  const pixCelita = pixRows.find(r => r.key === 'pix_celita')?.value ?? '';
  const pixMarcelo = pixRows.find(r => r.key === 'pix_marcelo')?.value ?? '';
  const reportDate = format(new Date(), 'dd/MM/yyyy');

  const parse = (r: any): InstallmentRow => ({
    id: String(r.id),
    installmentNumber: Number(r.installment_number),
    originalAmount: parseFloat(r.original_amount?.toString() ?? '0'),
    paidAmount: parseFloat(r.paid_amount?.toString() ?? '0'),
    status: String(r.status ?? ''),
    dueDate: new Date(r.due_date),
    customerName: String(r.customer_name ?? ''),
    customerPhone: String(r.customer_phone ?? ''),
    address: fmtAddress(r),
    totalInstallments: Number(r.total_installments ?? 0),
    remainingCount: Number(r.remaining_count ?? 0),
    totalRemaining: parseFloat(r.total_remaining?.toString() ?? '0'),
    daysOverdue: Number(r.days_overdue ?? 0),
  });

  const all = (rows as any[]).map(parse);
  const today = all.filter(r => r.daysOverdue === 0);
  const overdue = all.filter(r => r.daysOverdue > 0);

  return { today, overdue, pixCelita, pixMarcelo, reportDate };
}

// --- HTML builder ---

function cardHtml(row: InstallmentRow, badge: string, badgeColor: string): string {
  const phone = fmtPhone(row.customerPhone);
  const isPartial = row.status === 'partial';
  const partialBadge = isPartial
    ? `<span class="badge" style="background:#ea580c">Pago parcialmente</span>`
    : '';
  const partialDetail = isPartial
    ? `&nbsp;|&nbsp; Pago: <strong>${brl(row.paidAmount)}</strong>
    &nbsp;|&nbsp; Restante: <strong>${brl(row.originalAmount - row.paidAmount)}</strong>`
    : '';
  return `
<div class="entry">
  <div class="entry-head">
    <span class="entry-name">${row.customerName}</span>
    <div style="display:flex;gap:4px;align-items:center">
      ${partialBadge}
      <span class="badge" style="background:${badgeColor}">${badge}</span>
    </div>
  </div>
  <div class="entry-sub">${phone}</div>
  ${row.address ? `<div class="entry-address">${row.address}</div>` : ''}
  <div class="entry-detail">
    Parcela <strong>${row.installmentNumber}/${row.totalInstallments}</strong>
    &nbsp;|&nbsp; Valor: <strong>${brl(row.originalAmount)}</strong>
    ${partialDetail}
    &nbsp;|&nbsp; Vencimento: <strong>${fmtDate(row.dueDate)}</strong>
    &nbsp;|&nbsp; Faltam: <strong>${row.remainingCount} parcela(s)</strong>
    &nbsp;|&nbsp; Total restante: <strong>${brl(row.totalRemaining)}</strong>
  </div>
</div>`;
}

function buildHtml(data: Awaited<ReturnType<typeof fetchReportData>>): string {
  const { today, overdue, reportDate } = data;

  const totalToday = today.reduce((s, r) => s + r.originalAmount, 0);
  const totalOverdue = overdue.reduce((s, r) => s + r.originalAmount, 0);
  const grandTotal = totalToday + totalOverdue;

  const todaySection = today.length === 0 ? '<p class="empty">Nenhuma parcela vencendo hoje.</p>' :
    today.map(r => cardHtml(r, 'Vence hoje', '#d97706')).join('');

  const overdueSection = overdue.length === 0 ? '<p class="empty">Nenhuma parcela atrasada.</p>' :
    overdue.map(r => cardHtml(r, `${r.daysOverdue} dia(s) em atraso`, '#dc2626')).join('');

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="height: 45px; width: auto;" alt="Amor Infinito Enxovais" />`
    : `<div class="logo">&#10084; Amor Infinito Enxovais</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #1a1a1a; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 6px;
    border-bottom: 2px solid #be123c;
    margin-bottom: 6px;
  }
  .logo { font-size: 15px; font-weight: bold; color: #be123c; }
  .report-title { font-size: 13px; font-weight: bold; text-align: center; letter-spacing: 1px; }
  .report-date { text-align: right; font-size: 9px; color: #555; }

  .summary {
    background: #f8f8f8;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    padding: 5px 10px;
    margin-bottom: 10px;
    font-size: 9.5px;
    display: flex;
    gap: 20px;
  }
  .summary span { font-weight: bold; }

  .section-title {
    font-size: 11px;
    font-weight: bold;
    padding: 4px 0;
    border-bottom: 1px solid #ddd;
    margin-bottom: 4px;
    margin-top: 8px;
    display: flex;
    justify-content: space-between;
  }
  .section-title.today { color: #b45309; }
  .section-title.overdue { color: #dc2626; }

  .entry {
    border: 1px solid #e5e5e5;
    border-radius: 3px;
    padding: 4px 6px;
    margin-bottom: 3px;
    page-break-inside: avoid;
  }
  .entry-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }
  .entry-name { font-weight: bold; font-size: 10.5px; }
  .badge {
    font-size: 8px;
    font-weight: bold;
    color: white;
    padding: 1px 6px;
    border-radius: 10px;
    white-space: nowrap;
  }
  .entry-sub { font-size: 9px; color: #555; margin-bottom: 1px; }
  .entry-address { font-size: 8.5px; color: #666; margin-bottom: 2px; }
  .entry-detail { font-size: 9px; color: #333; }

  .empty { font-size: 9px; color: #888; padding: 4px 0; font-style: italic; }

  .footer {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 2px solid #be123c;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 9px;
    color: #444;
  }
  .footer-total { font-size: 12px; font-weight: bold; color: #1a1a1a; }
</style>
</head>
<body>

  <div class="header">
    <div>${logoHtml}</div>
    <div class="report-title">RELATÓRIO DE COBRANÇA</div>
    <div class="report-date">${reportDate}</div>
  </div>

  <div class="summary">
    <div>Vencendo hoje: <span>${today.length}</span></div>
    <div>Atrasadas: <span>${overdue.length}</span></div>
    <div>Total a cobrar: <span>${brl(grandTotal)}</span></div>
  </div>

  <div class="section-title today">
    <span>VENCENDO HOJE</span>
    <span>${brl(totalToday)}</span>
  </div>
  ${todaySection}

  <div class="section-title overdue">
    <span>PARCELAS ATRASADAS</span>
    <span>${brl(totalOverdue)}</span>
  </div>
  ${overdueSection}

  <div class="footer">
    <div>Amor Infinito Enxovais</div>
    <div class="footer-total">Total geral a cobrar: ${brl(grandTotal)}</div>
  </div>

</body>
</html>`;
}

// --- PDF generation ---

export async function generateRelatorioCobrancaPdf(): Promise<Buffer> {
  const data = await fetchReportData();
  const html = buildHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
