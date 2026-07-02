import { db } from '../database';
import { sql } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export type RiskLevel = 'good' | 'attention' | 'high_risk';

export interface DelinquencyScoreRow {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  renegotiations_count: number;
  has_renegotiation: boolean;
  late_payments: number;
  overdue_8_30: number;
  overdue_30plus: number;
  date_changes: number;
  score: number;
  risk: RiskLevel;
}

export interface DelinquencyScoreParams {
  page?: number;
  limit?: number;
  search?: string;
  riskFilter?: RiskLevel;
}

function calcRisk(score: number): RiskLevel {
  if (score >= 700) return 'good';
  if (score >= 400) return 'attention';
  return 'high_risk';
}

function computeScore(row: {
  latest_ren_id: string | null;
  noren_late: number; noren_o8_30: number; noren_o30plus: number;
  noren_grace_days: number; noren_dc: number;
  ren_late: number; ren_o8_30: number; ren_o30plus: number;
  ren_grace_days: number; ren_dc: number;
}): number {
  if (row.latest_ren_id) {
    // Renegotiation clean-slate: only count behaviour on the new agreement
    return Math.max(0, Math.round(
      1000
      - row.ren_late    * 15
      - row.ren_o8_30   * 10
      - row.ren_o30plus * 30
      - Math.min(row.ren_grace_days, 365) * 0.5
      - row.ren_dc      * 12  // reoffending on dates weighs more after renegotiation
    ));
  }
  return Math.max(0, Math.round(
    1000
    - row.noren_late    * 15
    - row.noren_o8_30   * 10
    - row.noren_o30plus * 30
    - Math.min(row.noren_grace_days, 365) * 0.5
    - row.noren_dc      * 5
  ));
}

async function fetchAllScores(search?: string): Promise<DelinquencyScoreRow[]> {
  const searchCond = search
    ? sql`AND (c.name LIKE ${`%${search}%`} OR c.cpf LIKE ${`%${search}%`} OR c.phone LIKE ${`%${search}%`})`
    : sql``;

  /*
   * Main JOIN strategy:
   *  - LEFT JOIN installments i (deleted_at IS NULL) — all active installments
   *  - LEFT JOIN renegotiations iren ON iren.id = i.sale_id
   *      → iren.id IS NULL  means the installment belongs to a regular sale (VEN-xxx)
   *      → iren.id NOT NULL means the installment belongs to a renegotiation (REN-xxx)
   *  - ren subquery: per-customer latest renegotiation id + count
   *  - norendc: date-change audit counts on original (non-ren) installments
   *  - rendc:   date-change audit counts on latest-ren installments
   *
   * 7-day grace: overdue conditions start at DATEDIFF > 7, not > 0.
   * Canceled installments (renegotiationId IS NOT NULL, deletedAt IS NOT NULL)
   * are excluded by the i.deleted_at IS NULL JOIN filter.
   */
  const [rows] = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.cpf,
      COALESCE(ren.ren_count, 0)  AS renegotiations_count,
      ren.latest_ren_id,

      /* ── NO-REN PATH: original installments (iren.id IS NULL = regular VEN-xxx sale) ── */
      COALESCE(SUM(CASE
        WHEN i.renegotiation_id IS NULL AND iren.id IS NULL
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) BETWEEN 8 AND 30
        THEN 1 ELSE 0 END), 0)                                              AS noren_o8_30,

      COALESCE(SUM(CASE
        WHEN i.renegotiation_id IS NULL AND iren.id IS NULL
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) > 30
        THEN 1 ELSE 0 END), 0)                                              AS noren_o30plus,

      COALESCE(SUM(CASE
        WHEN i.renegotiation_id IS NULL AND iren.id IS NULL
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) > 7
        THEN DATEDIFF(CURDATE(), DATE(i.due_date)) - 7 ELSE 0 END), 0)    AS noren_grace_days,

      COALESCE(SUM(CASE
        WHEN i.renegotiation_id IS NULL AND iren.id IS NULL
          AND i.status = 'paid' AND i.payment_date > i.due_date
        THEN 1 ELSE 0 END), 0)                                              AS noren_late,

      COALESCE(norendc.dc_count, 0)                                         AS noren_dc,

      /* ── REN PATH: installments of the customer's latest renegotiation ── */
      COALESCE(SUM(CASE
        WHEN ren.latest_ren_id IS NOT NULL
          AND i.sale_id = ren.latest_ren_id
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) BETWEEN 8 AND 30
        THEN 1 ELSE 0 END), 0)                                              AS ren_o8_30,

      COALESCE(SUM(CASE
        WHEN ren.latest_ren_id IS NOT NULL
          AND i.sale_id = ren.latest_ren_id
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) > 30
        THEN 1 ELSE 0 END), 0)                                              AS ren_o30plus,

      COALESCE(SUM(CASE
        WHEN ren.latest_ren_id IS NOT NULL
          AND i.sale_id = ren.latest_ren_id
          AND i.status IN ('pending','overdue')
          AND DATEDIFF(CURDATE(), DATE(i.due_date)) > 7
        THEN DATEDIFF(CURDATE(), DATE(i.due_date)) - 7 ELSE 0 END), 0)    AS ren_grace_days,

      COALESCE(SUM(CASE
        WHEN ren.latest_ren_id IS NOT NULL
          AND i.sale_id = ren.latest_ren_id
          AND i.status = 'paid' AND i.payment_date > i.due_date
        THEN 1 ELSE 0 END), 0)                                              AS ren_late,

      COALESCE(rendc.dc_count, 0)                                           AS ren_dc

    FROM customers c
    LEFT JOIN installments i    ON i.customer_id = c.id AND i.deleted_at IS NULL
    LEFT JOIN renegotiations iren ON iren.id = i.sale_id
    LEFT JOIN (
      /* Latest renegotiation per customer */
      SELECT
        customer_id,
        COUNT(*) AS ren_count,
        SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY created_at DESC), ',', 1) AS latest_ren_id
      FROM renegotiations
      GROUP BY customer_id
    ) ren ON ren.customer_id = c.id
    LEFT JOIN (
      /* Date changes on original (non-ren) installments */
      SELECT inst.customer_id, COUNT(*) AS dc_count
      FROM audit_logs al
      JOIN installments inst ON inst.id = al.entity_id
        AND inst.renegotiation_id IS NULL AND inst.deleted_at IS NULL
      LEFT JOIN renegotiations irn2 ON irn2.id = inst.sale_id
      WHERE al.action = 'UPDATE_INSTALLMENT_DATE' AND irn2.id IS NULL
      GROUP BY inst.customer_id
    ) norendc ON norendc.customer_id = c.id
    LEFT JOIN (
      /* Date changes on installments of the latest renegotiation */
      SELECT inst.customer_id, COUNT(*) AS dc_count
      FROM audit_logs al
      JOIN installments inst ON inst.id = al.entity_id AND inst.deleted_at IS NULL
      JOIN renegotiations r   ON r.id = inst.sale_id
      JOIN (
        SELECT customer_id, MAX(created_at) AS max_dt
        FROM renegotiations GROUP BY customer_id
      ) lat ON lat.customer_id = r.customer_id AND lat.max_dt = r.created_at
      WHERE al.action = 'UPDATE_INSTALLMENT_DATE'
      GROUP BY inst.customer_id
    ) rendc ON rendc.customer_id = c.id
    WHERE c.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM installments WHERE customer_id = c.id AND deleted_at IS NULL)
      ${searchCond}
    GROUP BY
      c.id, c.name, c.phone, c.cpf,
      ren.ren_count, ren.latest_ren_id,
      norendc.dc_count, rendc.dc_count
  `) as any;

  return (rows as any[]).map(row => {
    const raw = {
      latest_ren_id:  row.latest_ren_id ?? null,
      noren_late:     Number(row.noren_late),
      noren_o8_30:    Number(row.noren_o8_30),
      noren_o30plus:  Number(row.noren_o30plus),
      noren_grace_days: Number(row.noren_grace_days),
      noren_dc:       Number(row.noren_dc),
      ren_late:       Number(row.ren_late),
      ren_o8_30:      Number(row.ren_o8_30),
      ren_o30plus:    Number(row.ren_o30plus),
      ren_grace_days: Number(row.ren_grace_days),
      ren_dc:         Number(row.ren_dc),
    };
    const hasRen = Boolean(raw.latest_ren_id);
    const score = computeScore(raw);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      cpf: row.cpf,
      renegotiations_count: Number(row.renegotiations_count),
      has_renegotiation: hasRen,
      // Expose the metrics that actually drove the score
      late_payments: hasRen ? raw.ren_late    : raw.noren_late,
      overdue_8_30:  hasRen ? raw.ren_o8_30   : raw.noren_o8_30,
      overdue_30plus: hasRen ? raw.ren_o30plus : raw.noren_o30plus,
      date_changes:  hasRen ? raw.ren_dc      : raw.noren_dc,
      score,
      risk: calcRisk(score),
    } as DelinquencyScoreRow;
  })
    // Piores no topo (score ASC), empates em ordem alfabética
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'));
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

// ─── PDF & Excel ─────────────────────────────────────────────────────────────

function riskLabel(risk: RiskLevel): string {
  if (risk === 'good') return 'Bom pagador';
  if (risk === 'attention') return 'Atenção';
  return 'Alto risco';
}

function riskColor(risk: RiskLevel): string {
  if (risk === 'good') return '#16a34a';
  if (risk === 'attention') return '#d97706';
  return '#dc2626';
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

  const rowsHtml = rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${row.name}${row.has_renegotiation ? ' <em style="color:#6b7280;font-size:8px">(ren.)</em>' : ''}</td>
      <td>${row.cpf || '—'}</td>
      <td>${row.phone || '—'}</td>
      <td><strong>${row.score}</strong></td>
      <td><span style="color:${riskColor(row.risk)};font-weight:600">${riskLabel(row.risk)}</span></td>
      <td>${row.late_payments}</td>
      <td>${row.overdue_8_30}</td>
      <td>${row.overdue_30plus}</td>
      <td>${row.date_changes}</td>
      <td>${row.renegotiations_count}</td>
    </tr>`).join('');

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
    .legend { font-size: 8px; color: #888; margin-top: 4px; }
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
      <div class="subtitle">Gerado em ${dateStr} · ${rows.length} cliente(s) · piores primeiro</div>
      <div class="legend">Score 0–1000 (estilo Serasa) · carência 7 dias · 🟢 ≥700 · 🟡 400–699 · 🔴 &lt;400</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Cliente</th>
        <th>CPF</th>
        <th>Telefone</th>
        <th>Score</th>
        <th>Risco</th>
        <th>Pgtos. Atrasados</th>
        <th>Parc. 8–30d</th>
        <th>Parc. 30+d</th>
        <th>Alt. Data</th>
        <th>Renegoc.</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Amor Infinito Enxovais — Relatório confidencial · (ren.) = métricas calculadas sobre o acordo de renegociação</div>
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
    ['#', 'Cliente', 'CPF', 'Telefone', 'Score (0–1000)', 'Risco', 'Pgtos. Atrasados', 'Parc. 8–30d', 'Parc. 30+d', 'Alt. Data', 'Renegociações', 'Base Cálculo'],
    ...rows.map((row, idx) => [
      idx + 1,
      row.name,
      row.cpf || '',
      row.phone || '',
      row.score,
      riskLabel(row.risk),
      row.late_payments,
      row.overdue_8_30,
      row.overdue_30plus,
      row.date_changes,
      row.renegotiations_count,
      row.has_renegotiation ? 'Acordo renegociado' : 'Histórico completo',
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 4 }, { wch: 32 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 17 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Score Inadimplência');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
