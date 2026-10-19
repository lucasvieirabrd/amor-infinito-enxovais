import { db } from '../database';
import { sql } from 'drizzle-orm';
import { launchBrowser } from '../utils/puppeteerLaunch';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function brl(v: number): string {
  const abs = Math.abs(v);
  const parts = abs.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '-' : ''}R$ ${intPart},${parts[1]}`;
}

function spNowStr(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const yy = d.getUTCFullYear();
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mn = d.getUTCMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mn}`;
}

interface ItemRow {
  sale_number: string;
  sale_date: string;
  customer_name: string;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  quantity: number;
  unit_price: string;
  total_price: string;
}

export async function generateSalesItemsReportPdf(month: number, year: number): Promise<Buffer> {
  const [rows] = await db.execute(sql`
    SELECT
      s.sale_number,
      DATE_FORMAT(CONVERT_TZ(s.sale_date, '+00:00', '-03:00'), '%d/%m/%Y') AS sale_date,
      c.name                                                                 AS customer_name,
      p.name                                                                 AS product_name,
      p.description                                                          AS product_description,
      COALESCE(p.category, 'Sem Categoria')                                  AS product_category,
      si.quantity,
      si.unit_price,
      si.total_price
    FROM sale_items si
    JOIN sales     s  ON s.id = si.sale_id
    JOIN products  p  ON p.id = si.product_id
    JOIN customers c  ON c.id = s.customer_id
    WHERE s.deleted_at IS NULL
      AND YEAR( CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = ${year}
      AND MONTH(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = ${month}
      AND s.sale_number LIKE 'VEN-%'
    ORDER BY COALESCE(p.category, 'Sem Categoria'), p.name, s.sale_date
  `);

  const items = rows as unknown as ItemRow[];

  const byCategory = new Map<string, ItemRow[]>();
  for (const item of items) {
    const cat = item.product_category ?? 'Sem Categoria';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const totalItems   = items.reduce((s, r) => s + Number(r.quantity),                   0);
  const totalRevenue = items.reduce((s, r) => s + parseFloat(String(r.total_price)), 0);

  const nowStr    = spNowStr();
  const monthLabel = `${MONTH_NAMES[month - 1]} de ${year}`;

  const summaryRows = Array.from(byCategory.entries()).map(([cat, catItems]) => {
    const catQty = catItems.reduce((s, r) => s + Number(r.quantity),                   0);
    const catRev = catItems.reduce((s, r) => s + parseFloat(String(r.total_price)), 0);
    return `<tr>
      <td>${cat}</td>
      <td class="c">${catQty}</td>
      <td class="r">${brl(catRev)}</td>
    </tr>`;
  }).join('');

  const sections = Array.from(byCategory.entries()).map(([cat, catItems]) => {
    const catQty = catItems.reduce((s, r) => s + Number(r.quantity),                   0);
    const catRev = catItems.reduce((s, r) => s + parseFloat(String(r.total_price)), 0);

    const rowsHtml = catItems.map(r => `
      <tr>
        <td>${r.sale_number}</td>
        <td>${r.sale_date}</td>
        <td>${r.customer_name}</td>
        <td>
          <strong>${r.product_name}</strong>
          ${r.product_description ? `<br><span class="desc">${r.product_description}</span>` : ''}
        </td>
        <td class="c">${r.quantity}</td>
        <td class="r">${brl(parseFloat(String(r.unit_price)))}</td>
        <td class="r">${brl(parseFloat(String(r.total_price)))}</td>
      </tr>`).join('');

    return `
      <div class="cat-section">
        <div class="cat-title">${cat}</div>
        <table>
          <thead>
            <tr>
              <th>Venda</th><th>Data</th><th>Cliente</th><th>Produto</th>
              <th class="c">Qtd</th><th class="r">Preço Un.</th><th class="r">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="subtotal-row">
              <td colspan="4">SUBTOTAL — ${cat}</td>
              <td class="c">${catQty}</td>
              <td></td>
              <td class="r">${brl(catRev)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #222; padding: 30px; }

    .header { border-bottom: 2px solid #9d174d; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
    .store-name   { font-size: 18px; font-weight: bold; color: #9d174d; }
    .report-title { font-size: 13px; font-weight: 600; color: #444; margin-top: 4px; }
    .report-month { font-size: 11px; color: #666; margin-top: 2px; }
    .meta         { font-size: 9px; color: #666; }

    .summary-cards { display: flex; gap: 12px; margin-bottom: 18px; }
    .sc         { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .sc.main    { border-color: #9d174d; background: #fff5f8; }
    .sc.neutral { border-color: #d1d5db; background: #f9fafb; }
    .sc-label { font-size: 8px; color: #777; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .sc-value { font-size: 20px; font-weight: bold; }
    .sc.main    .sc-value { color: #9d174d; }
    .sc.neutral .sc-value { color: #374151; }

    .section-title { font-size: 10px; font-weight: bold; color: #9d174d; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #f3e8ee; padding-bottom: 4px; margin-bottom: 10px; margin-top: 18px; }

    .summary-table table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    .summary-table thead th     { background: #9d174d; color: #fff; padding: 6px 10px; font-size: 9px; text-align: left; }
    .summary-table thead th.c   { text-align: center; }
    .summary-table thead th.r   { text-align: right; }
    .summary-table tbody td     { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
    .summary-table tbody td.c   { text-align: center; }
    .summary-table tbody td.r   { text-align: right; }
    .summary-table .total-row td { background: #fdf2f8; font-weight: bold; border-top: 2px solid #9d174d; }

    .cat-section { margin-bottom: 22px; page-break-inside: avoid; }
    .cat-title { font-size: 11px; font-weight: bold; color: #5b21b6; background: #f5f3ff; padding: 6px 10px; border-left: 3px solid #7c3aed; margin-bottom: 6px; }

    table { width: 100%; border-collapse: collapse; }
    thead th     { background: #374151; color: #fff; padding: 6px 10px; font-size: 9px; text-align: left; }
    thead th.c   { text-align: center; }
    thead th.r   { text-align: right; }
    tbody td     { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tbody td.c   { text-align: center; }
    tbody td.r   { text-align: right; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .subtotal-row td { background: #ede9fe !important; font-weight: bold; border-top: 1px solid #7c3aed; color: #5b21b6; }
    .desc { font-size: 8px; color: #888; }

    .empty  { color: #888; font-size: 11px; padding: 20px 0; text-align: center; }
    .footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8px; color: #bbb; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">Amor Infinito Enxovais</div>
      <div class="report-title">Itens Vendidos no Mês</div>
      <div class="report-month">${monthLabel}</div>
    </div>
    <div style="text-align:right;">
      <div class="meta">Gerado em: <strong>${nowStr}</strong></div>
    </div>
  </div>

  <div class="summary-cards">
    <div class="sc main">
      <div class="sc-label">Total de Itens Vendidos</div>
      <div class="sc-value">${totalItems}</div>
    </div>
    <div class="sc neutral">
      <div class="sc-label">Receita Total</div>
      <div class="sc-value">${brl(totalRevenue)}</div>
    </div>
    <div class="sc neutral">
      <div class="sc-label">Categorias</div>
      <div class="sc-value">${byCategory.size}</div>
    </div>
  </div>

  <div class="section-title">Resumo por Categoria</div>
  <div class="summary-table">
    <table>
      <thead>
        <tr>
          <th>Categoria</th>
          <th class="c">Qtd Itens</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRows || '<tr><td colspan="3" style="text-align:center;color:#888">Nenhum dado</td></tr>'}
        <tr class="total-row">
          <td>TOTAL GERAL</td>
          <td class="c">${totalItems}</td>
          <td class="r">${brl(totalRevenue)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${items.length === 0
    ? '<p class="empty">Nenhum item vendido neste mês.</p>'
    : `<div class="section-title">Detalhamento por Categoria</div>${sections}`}

  <div class="footer">Amor Infinito Enxovais — Itens Vendidos · ${monthLabel} · Gerado em ${nowStr}</div>
</body>
</html>`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
