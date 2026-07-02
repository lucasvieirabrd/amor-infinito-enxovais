import { db } from '../database';
import { sql } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export interface DelinquencyScoreRow {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  overdue_count: number;
  total_days_overdue: number;
  late_payments_count: number;
  renegotiations_count: number;
  date_changes_count: number;
  score: number;
  risk: 'low' | 'medium' | 'high';
}

export interface DelinquencyScoreParams {
  page?: number;
  limit?: number;
  search?: string;
  riskFilter?: 'low' | 'medium' | 'high';
}

function calcRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 80) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

async function fetchAllScores(search?: string): Promise<DelinquencyScoreRow[]> {
  const searchCond = search
    ? sql`AND (c.name LIKE ${`%${search}%`} OR c.cpf LIKE ${`%${search}%`} OR c.phone LIKE ${`%${search}%`})`
    : sql``;

  const [rows] = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.cpf,
      COALESCE(od.overdue_count, 0)         AS overdue_count,
      COALESCE(od.total_days_overdue, 0)    AS total_days_overdue,
      COALESCE(lp.late_payments_count, 0)   AS late_payments_count,
      COALESCE(rn.renegotiations_count, 0)  AS renegotiations_count,
      COALESCE(dc.date_changes_count, 0)    AS date_changes_count,
      ROUND(
        COALESCE(od.overdue_count, 0) * 30
        + LEAST(COALESCE(od.total_days_overdue, 0), 365) * 0.5
        + COALESCE(lp.late_payments_count, 0) * 5
        + COALESCE(rn.renegotiations_count, 0) * 20
        + COALESCE(dc.date_changes_count, 0) * 3
      , 1) AS score
    FROM customers c
    LEFT JOIN (
      SELECT
        customer_id,
        COUNT(*) AS overdue_count,
        SUM(GREATEST(DATEDIFF(CURDATE(), DATE(due_date)), 0)) AS total_days_overdue
      FROM installments
      WHERE deleted_at IS NULL
        AND status IN ('pending', 'overdue')
        AND due_date < CURDATE()
      GROUP BY customer_id
    ) od ON od.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS late_payments_count
      FROM installments
      WHERE deleted_at IS NULL
        AND status = 'paid'
        AND payment_date > due_date
      GROUP BY customer_id
    ) lp ON lp.customer_id = c.id
    LEFT JOIN (
      SELECT i.customer_id, COUNT(*) AS renegotiations_count
      FROM audit_logs al
      JOIN installments i ON i.id = al.entity_id AND i.deleted_at IS NULL
      WHERE al.action = 'UPDATE_INSTALLMENT'
      GROUP BY i.customer_id
    ) rn ON rn.customer_id = c.id
    LEFT JOIN (
      SELECT i.customer_id, COUNT(*) AS date_changes_count
      FROM audit_logs al
      JOIN installments i ON i.id = al.entity_id AND i.deleted_at IS NULL
      WHERE al.action = 'UPDATE_INSTALLMENT_DATE'
      GROUP BY i.customer_id
    ) dc ON dc.customer_id = c.id
    WHERE c.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM installments WHERE customer_id = c.id AND deleted_at IS NULL)
      ${searchCond}
    ORDER BY score DESC
  `) as any;

  return (rows as any[]).map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    cpf: row.cpf,
    overdue_count: Number(row.overdue_count),
    total_days_overdue: Number(row.total_days_overdue),
    late_payments_count: Number(row.late_payments_count),
    renegotiations_count: Number(row.renegotiations_count),
    date_changes_count: Number(row.date_changes_count),
    score: Number(row.score),
    risk: calcRisk(Number(row.score)),
  }));
}

export async function getDelinquencyScoreData(params: DelinquencyScoreParams) {
  const { page = 1, limit = 20, search, riskFilter } = params;

  const allRows = await fetchAllScores(search);
  const filtered = riskFilter ? allRows.filter(r => r.risk === riskFilter) : allRows;

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const data = filtered.slice(offset, offset + limit);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function riskBadge(risk: string): string {
  if (risk === 'high') return 'Alto';
  if (risk === 'medium') return 'Médio';
  return 'Baixo';
}

function riskColor(risk: string): string {
  if (risk === 'high') return '#ef4444';
  if (risk === 'medium') return '#f59e0b';
  return '#22c55e';
}

function getLogoBase64(): string {
  const candidates = [
    path.join(__dirname, '../../public/logo-amor-infinito.jpeg'),
    path.join(__dirname, '../../../public/logo-amor-infinito.jpeg'),
    path.join(process.cwd(), 'public/logo-amor-infinito.jpeg'),
    path.join(process.cwd(), '../frontend/public/logo-amor-infinito.jpeg'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text y="30" font-size="18" fill="#9d174d" font-family="Arial">Amor Infinito</text></svg>'
  ).toString('base64')}`;
}

export async function generateDelinquencyScorePdf(rows: DelinquencyScoreRow[]): Promise<Buffer> {
  const logoSrc = getLogoBase64();
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const rowsHtml = rows
    .map(
      (row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${row.name}</td>
      <td>${row.cpf || '—'}</td>
      <td>${row.phone || '—'}</td>
      <td>${row.overdue_count}</td>
      <td>${row.total_days_overdue}</td>
      <td>${row.late_payments_count}</td>
      <td>${row.renegotiations_count}</td>
      <td>${row.date_changes_count}</td>
      <td><strong>${row.score}</strong></td>
      <td><span style="color:${riskColor(row.risk)};font-weight:600">${riskBadge(row.risk)}</span></td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #333; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .logo { height: 60px; width: auto; }
    .title { font-size: 18px; font-weight: bold; color: #9d174d; }
    .subtitle { font-size: 11px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 9px; }
    th { background: #9d174d; color: white; padding: 6px 4px; text-align: left; white-space: nowrap; }
    td { padding: 5px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #fdf2f8; }
    .footer { margin-top: 16px; font-size: 8px; color: #999; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" class="logo" alt="Logo" />
    <div style="text-align:right">
      <div class="title">Score de Inadimplência</div>
      <div class="subtitle">Gerado em ${dateStr} · ${rows.length} cliente(s)</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Cliente</th>
        <th>CPF</th>
        <th>Telefone</th>
        <th>Parc. Vencidas</th>
        <th>Dias em Atraso</th>
        <th>Pgtos. Atrasados</th>
        <th>Renegoc.</th>
        <th>Alt. Data</th>
        <th>Score</th>
        <th>Risco</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Amor Infinito Enxovais — Relatório confidencial</div>
</body>
</html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

export function generateDelinquencyScoreExcel(rows: DelinquencyScoreRow[]): Buffer {
  const sheetData = [
    ['#', 'Cliente', 'CPF', 'Telefone', 'Parc. Vencidas', 'Dias em Atraso', 'Pgtos. Atrasados', 'Renegociações', 'Alt. de Data', 'Score', 'Risco'],
    ...rows.map((row, idx) => [
      idx + 1,
      row.name,
      row.cpf || '',
      row.phone || '',
      row.overdue_count,
      row.total_days_overdue,
      row.late_payments_count,
      row.renegotiations_count,
      row.date_changes_count,
      row.score,
      riskBadge(row.risk),
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 4 }, { wch: 32 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 15 }, { wch: 17 }, { wch: 13 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Score Inadimplência');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
