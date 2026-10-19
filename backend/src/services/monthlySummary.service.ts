import { db } from '../database';
import { sql } from 'drizzle-orm';
import puppeteer from 'puppeteer';

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

function toF(v: unknown): number { return parseFloat(String(v ?? 0)) || 0; }
function toN(v: unknown): number { return parseInt(String(v  ?? 0), 10) || 0; }

export async function generateMonthlySummaryPdf(month: number, year: number): Promise<Buffer> {
  const [
    salesResult,
    receivedResult,
    productsResult,
    deliveriesResult,
    dateChangesResult,
    cancelledResult,
    receivableResult,
    overdueResult,
    processResult,
    agreementResult,
  ] = await Promise.all([
    // Block 1 — Sales summary
    db.execute(sql`
      SELECT
        COUNT(*)                                                                                        AS count,
        COALESCE(SUM(total_amount), 0)                                                                  AS total,
        COALESCE(SUM(CASE WHEN payment_method = 'cash'        THEN total_amount ELSE 0 END), 0)         AS cash_total,
        COUNT(CASE WHEN payment_method = 'cash'        THEN 1 END)                                      AS cash_count,
        COALESCE(SUM(CASE WHEN payment_method = 'credit_card' THEN total_amount ELSE 0 END), 0)         AS card_total,
        COUNT(CASE WHEN payment_method = 'credit_card' THEN 1 END)                                      AS card_count,
        COALESCE(SUM(CASE WHEN payment_method = 'installment' THEN total_amount ELSE 0 END), 0)         AS inst_total,
        COUNT(CASE WHEN payment_method = 'installment' THEN 1 END)                                      AS inst_count
      FROM sales
      WHERE deleted_at IS NULL
        AND is_imported = 0
        AND YEAR( CONVERT_TZ(sale_date, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(sale_date, '+00:00', '-03:00')) = ${month}
    `),

    // Block 2 — Received payments
    db.execute(sql`
      SELECT
        COALESCE(SUM(paid_amount), 0)                                                                   AS total,
        COALESCE(SUM(CASE WHEN installment_number >= 1 THEN paid_amount ELSE 0 END), 0)                 AS installments_total,
        COALESCE(SUM(CASE WHEN installment_number = 0  THEN paid_amount ELSE 0 END), 0)                 AS entries_total,
        COUNT(CASE WHEN installment_number >= 1 AND paid_amount > 0 THEN 1 END)                         AS installments_count,
        COUNT(CASE WHEN installment_number = 0  AND paid_amount > 0 THEN 1 END)                         AS entries_count
      FROM installments
      WHERE deleted_at IS NULL
        AND paid_amount > 0
        AND payment_date IS NOT NULL
        AND YEAR( CONVERT_TZ(payment_date, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(payment_date, '+00:00', '-03:00')) = ${month}
    `),

    // Block 3 — Products sold (category summary)
    db.execute(sql`
      SELECT
        COALESCE(p.category, 'Sem Categoria') AS category,
        SUM(si.quantity)                       AS qty,
        SUM(si.total_price)                    AS total
      FROM sale_items si
      JOIN sales    s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.deleted_at IS NULL
        AND YEAR( CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = ${month}
        AND s.sale_number LIKE 'VEN-%'
      GROUP BY COALESCE(p.category, 'Sem Categoria')
      ORDER BY COALESCE(p.category, 'Sem Categoria')
    `),

    // Block 4 — Deliveries
    db.execute(sql`
      SELECT
        COUNT(*)                                                                 AS total,
        SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END)              AS delivered,
        SUM(CASE WHEN delivery_type = 'com_montagem'  THEN 1 ELSE 0 END)       AS with_assembly,
        SUM(CASE WHEN delivery_type = 'sem_montagem'  THEN 1 ELSE 0 END)       AS without_assembly,
        SUM(CASE WHEN delivery_type IS NULL            THEN 1 ELSE 0 END)       AS type_unknown
      FROM deliveries
      WHERE deleted_at IS NULL
        AND YEAR( CONVERT_TZ(created_at, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(created_at, '+00:00', '-03:00')) = ${month}
    `),

    // Block 5 — Due-date changes by user
    db.execute(sql`
      SELECT
        u.name  AS user_name,
        COUNT(*) AS changes
      FROM audit_logs al
      JOIN users u ON u.id = al.user_id
      WHERE al.action = 'UPDATE_INSTALLMENT_DATE'
        AND YEAR( CONVERT_TZ(al.timestamp, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(al.timestamp, '+00:00', '-03:00')) = ${month}
      GROUP BY u.id, u.name
      ORDER BY changes DESC
    `),

    // Block 6 — Cancelled sales
    db.execute(sql`
      SELECT
        COUNT(*)                        AS count,
        COALESCE(SUM(total_amount), 0)  AS total
      FROM sales
      WHERE deleted_at IS NOT NULL
        AND is_imported = 0
        AND YEAR( CONVERT_TZ(deleted_at, '+00:00', '-03:00')) = ${year}
        AND MONTH(CONVERT_TZ(deleted_at, '+00:00', '-03:00')) = ${month}
    `),

    // Block 7 — Crediário: total receivable (current snapshot)
    db.execute(sql`
      SELECT COALESCE(SUM(original_amount - COALESCE(paid_amount, 0)), 0) AS total
      FROM installments
      WHERE deleted_at IS NULL AND status IN ('pending', 'overdue', 'partial')
    `),

    // Block 7 — overdue (normal customers only)
    db.execute(sql`
      SELECT COALESCE(SUM(i.original_amount - COALESCE(i.paid_amount, 0)), 0) AS total,
             COUNT(*) AS count
      FROM installments i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
        AND i.status IN ('pending', 'overdue', 'partial')
        AND c.customer_status = 'normal'
        AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) < CURDATE()
    `),

    // Block 7 — in legal process
    db.execute(sql`
      SELECT COALESCE(SUM(i.original_amount - COALESCE(i.paid_amount, 0)), 0) AS total,
             COUNT(DISTINCT i.customer_id) AS customer_count
      FROM installments i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
        AND i.status IN ('pending', 'overdue', 'partial')
        AND c.customer_status = 'legal_process'
    `),

    // Block 7 — in agreement
    db.execute(sql`
      SELECT COALESCE(SUM(i.original_amount - COALESCE(i.paid_amount, 0)), 0) AS total,
             COUNT(DISTINCT i.customer_id) AS customer_count
      FROM installments i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
        AND i.status IN ('pending', 'overdue', 'partial')
        AND c.customer_status = 'agreement'
    `),
  ]);

  // ── Parse results ──────────────────────────────────────────────────────────
  const s  = (salesResult[0]      as unknown as any[])[0] ?? {};
  const rc = (receivedResult[0]   as unknown as any[])[0] ?? {};
  const products = (productsResult[0] as unknown as any[]);
  const dv = (deliveriesResult[0]  as unknown as any[])[0] ?? {};
  const dateChanges = (dateChangesResult[0] as unknown as any[]);
  const cn = (cancelledResult[0]   as unknown as any[])[0] ?? {};
  const rv = (receivableResult[0]  as unknown as any[])[0] ?? {};
  const od = (overdueResult[0]     as unknown as any[])[0] ?? {};
  const pr = (processResult[0]     as unknown as any[])[0] ?? {};
  const ag = (agreementResult[0]   as unknown as any[])[0] ?? {};

  const salesTotal     = toF(s.total);
  const salesCount     = toN(s.count);
  const cashTotal      = toF(s.cash_total);  const cashCount  = toN(s.cash_count);
  const cardTotal      = toF(s.card_total);  const cardCount  = toN(s.card_count);
  const instTotal      = toF(s.inst_total);  const instCount  = toN(s.inst_count);
  const ticketMedio    = salesCount > 0 ? salesTotal / salesCount : 0;

  const recTotal       = toF(rc.total);
  const recInst        = toF(rc.installments_total); const recInstCount  = toN(rc.installments_count);
  const recEntry       = toF(rc.entries_total);      const recEntryCount = toN(rc.entries_count);

  const prodTotal      = products.reduce((s: number, r: any) => s + toF(r.total), 0);
  const prodQty        = products.reduce((s: number, r: any) => s + toN(r.qty),   0);

  const dvTotal        = toN(dv.total);
  const dvDelivered    = toN(dv.delivered);
  const dvAssembly     = toN(dv.with_assembly);
  const dvNoAssembly   = toN(dv.without_assembly);

  const dcTotal        = dateChanges.reduce((s: number, r: any) => s + toN(r.changes), 0);

  const cnCount        = toN(cn.count);
  const cnTotal        = toF(cn.total);

  const rvTotal        = toF(rv.total);
  const odTotal        = toF(od.total); const odCount   = toN(od.count);
  const prTotal        = toF(pr.total); const prClients = toN(pr.customer_count);
  const agTotal        = toF(ag.total); const agClients = toN(ag.customer_count);

  const nowStr     = spNowStr();
  const monthLabel = `${MONTH_NAMES[month - 1]} de ${year}`;

  // ── HTML helpers ──────────────────────────────────────────────────────────
  const pmt = (label: string, count: number, value: number, pct: number) =>
    value > 0 ? `<tr>
      <td>${label}</td>
      <td class="c">${count}</td>
      <td class="r">${brl(value)}</td>
      <td class="r">${pct.toFixed(1)}%</td>
    </tr>` : '';

  const prodRows = products.map((r: any) => `<tr>
    <td>${r.category}</td>
    <td class="c">${toN(r.qty)}</td>
    <td class="r">${brl(toF(r.total))}</td>
  </tr>`).join('') || '<tr><td colspan="3" class="empty-cell">Nenhum item vendido no período</td></tr>';

  const dcRows = dateChanges.length > 0
    ? dateChanges.map((r: any) => `<tr>
        <td>${r.user_name}</td>
        <td class="c">${toN(r.changes)}</td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="empty-cell">Nenhuma alteração registrada</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #222; padding: 30px; }

    .header { border-bottom: 2px solid #9d174d; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .store-name   { font-size: 18px; font-weight: bold; color: #9d174d; }
    .report-title { font-size: 13px; font-weight: 600; color: #444; margin-top: 4px; }
    .report-month { font-size: 11px; color: #666; margin-top: 2px; }
    .meta         { font-size: 9px; color: #666; }

    /* ── Period section ── */
    .period-section { margin-bottom: 6px; }
    .section-header { font-size: 11px; font-weight: bold; color: #9d174d; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #9d174d; padding-bottom: 4px; margin-bottom: 14px; margin-top: 20px; }
    .section-header:first-of-type { margin-top: 0; }

    .block-title { font-size: 10px; font-weight: bold; color: #4b5563; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px; margin-top: 14px; }
    .block-title:first-of-type { margin-top: 0; }

    /* ── Cards row ── */
    .cards { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .card { flex: 1; min-width: 80px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
    .card.main    { border-color: #9d174d; background: #fff5f8; }
    .card.green   { border-color: #86efac; background: #f0fdf4; }
    .card.blue    { border-color: #93c5fd; background: #eff6ff; }
    .card.purple  { border-color: #c4b5fd; background: #f5f3ff; }
    .card.orange  { border-color: #fed7aa; background: #fff7ed; }
    .card.red     { border-color: #fca5a5; background: #fff8f8; }
    .card.teal    { border-color: #99f6e4; background: #f0fdfa; }
    .card.gray    { border-color: #d1d5db; background: #f9fafb; }
    .card-label { font-size: 8px; color: #777; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
    .card-value { font-size: 16px; font-weight: bold; line-height: 1.1; }
    .card.main   .card-value { color: #9d174d; }
    .card.green  .card-value { color: #15803d; }
    .card.blue   .card-value { color: #1d4ed8; }
    .card.purple .card-value { color: #5b21b6; }
    .card.orange .card-value { color: #c2410c; }
    .card.red    .card-value { color: #b91c1c; }
    .card.teal   .card-value { color: #0f766e; }
    .card.gray   .card-value { color: #374151; }
    .card-sub { font-size: 8px; color: #999; margin-top: 3px; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead th      { background: #374151; color: #fff; padding: 6px 10px; font-size: 9px; text-align: left; }
    thead th.c    { text-align: center; }
    thead th.r    { text-align: right; }
    tbody td      { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
    tbody td.c    { text-align: center; }
    tbody td.r    { text-align: right; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .total-row td { background: #fdf2f8 !important; font-weight: bold; border-top: 2px solid #9d174d; }
    .empty-cell   { text-align: center; color: #888; padding: 8px 0; }

    /* ── Snapshot section (crediário) ── */
    .snapshot-wrapper { margin-top: 26px; border: 2px dashed #f59e0b; border-radius: 8px; padding: 14px 16px; background: #fffbeb; page-break-inside: avoid; }
    .snapshot-badge { display: inline-block; background: #f59e0b; color: #fff; font-size: 9px; font-weight: bold; padding: 2px 8px; border-radius: 4px; letter-spacing: .04em; margin-bottom: 8px; }
    .snapshot-warning { font-size: 9px; color: #92400e; margin-bottom: 12px; font-style: italic; }
    .snapshot-title { font-size: 11px; font-weight: bold; color: #92400e; margin-bottom: 10px; }

    .footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8px; color: #bbb; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">Amor Infinito Enxovais</div>
      <div class="report-title">Relatório Geral do Mês</div>
      <div class="report-month">${monthLabel}</div>
    </div>
    <div style="text-align:right;">
      <div class="meta">Gerado em: <strong>${nowStr}</strong></div>
    </div>
  </div>

  <!-- ══════════════ PERÍODO ══════════════ -->
  <div class="section-header">Dados do Período — ${monthLabel}</div>

  <!-- Block 1: Vendas -->
  <div class="block-title">1. Resumo de Vendas</div>
  <div class="cards">
    <div class="card main">
      <div class="card-label">Total do Mês</div>
      <div class="card-value">${brl(salesTotal)}</div>
      <div class="card-sub">${salesCount} venda${salesCount !== 1 ? 's' : ''} · ticket médio ${brl(ticketMedio)}</div>
    </div>
    ${cashTotal > 0 ? `<div class="card green">
      <div class="card-label">À Vista</div>
      <div class="card-value">${brl(cashTotal)}</div>
      <div class="card-sub">${cashCount} venda${cashCount !== 1 ? 's' : ''}</div>
    </div>` : ''}
    ${cardTotal > 0 ? `<div class="card blue">
      <div class="card-label">Cartão</div>
      <div class="card-value">${brl(cardTotal)}</div>
      <div class="card-sub">${cardCount} venda${cardCount !== 1 ? 's' : ''}</div>
    </div>` : ''}
    ${instTotal > 0 ? `<div class="card purple">
      <div class="card-label">Crediário</div>
      <div class="card-value">${brl(instTotal)}</div>
      <div class="card-sub">${instCount} venda${instCount !== 1 ? 's' : ''}</div>
    </div>` : ''}
  </div>
  ${salesCount > 0 ? `<table>
    <thead><tr><th>Forma de Pagamento</th><th class="c">Qtd</th><th class="r">Valor</th><th class="r">%</th></tr></thead>
    <tbody>
      ${pmt('À Vista',   cashCount, cashTotal, salesTotal > 0 ? (cashTotal / salesTotal) * 100 : 0)}
      ${pmt('Cartão de Crédito', cardCount, cardTotal, salesTotal > 0 ? (cardTotal / salesTotal) * 100 : 0)}
      ${pmt('Crediário', instCount, instTotal, salesTotal > 0 ? (instTotal / salesTotal) * 100 : 0)}
      <tr class="total-row"><td>TOTAL</td><td class="c">${salesCount}</td><td class="r">${brl(salesTotal)}</td><td class="r">100%</td></tr>
    </tbody>
  </table>` : '<p style="color:#888;font-size:10px;padding:6px 0">Nenhuma venda no período.</p>'}

  <!-- Block 2: Recebimentos -->
  <div class="block-title">2. Recebimentos no Período</div>
  <div class="cards">
    <div class="card green">
      <div class="card-label">Total Recebido</div>
      <div class="card-value">${brl(recTotal)}</div>
    </div>
    <div class="card blue">
      <div class="card-label">Parcelas Recebidas</div>
      <div class="card-value">${brl(recInst)}</div>
      <div class="card-sub">${recInstCount} lançamento${recInstCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="card purple">
      <div class="card-label">Entradas Recebidas</div>
      <div class="card-value">${brl(recEntry)}</div>
      <div class="card-sub">${recEntryCount} lançamento${recEntryCount !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <!-- Block 3: Produtos -->
  <div class="block-title">3. Produtos Vendidos — Sumário por Categoria</div>
  ${products.length > 0 ? `<div class="cards">
    <div class="card main">
      <div class="card-label">Total de Itens</div>
      <div class="card-value">${prodQty}</div>
    </div>
    <div class="card gray">
      <div class="card-label">Receita de Produtos</div>
      <div class="card-value">${brl(prodTotal)}</div>
    </div>
    <div class="card gray">
      <div class="card-label">Categorias</div>
      <div class="card-value">${products.length}</div>
    </div>
  </div>` : ''}
  <table>
    <thead><tr><th>Categoria</th><th class="c">Qtd Itens</th><th class="r">Total</th></tr></thead>
    <tbody>
      ${prodRows}
      ${products.length > 0 ? `<tr class="total-row"><td>TOTAL GERAL</td><td class="c">${prodQty}</td><td class="r">${brl(prodTotal)}</td></tr>` : ''}
    </tbody>
  </table>

  <!-- Block 4: Entregas -->
  <div class="block-title">4. Entregas e Montagens</div>
  <div class="cards">
    <div class="card gray">
      <div class="card-label">Criadas no Mês</div>
      <div class="card-value">${dvTotal}</div>
    </div>
    <div class="card green">
      <div class="card-label">Entregues</div>
      <div class="card-value">${dvDelivered}</div>
      <div class="card-sub">${dvTotal > 0 ? ((dvDelivered / dvTotal) * 100).toFixed(0) : 0}% do total</div>
    </div>
    <div class="card orange">
      <div class="card-label">Com Montagem</div>
      <div class="card-value">${dvAssembly}</div>
    </div>
    <div class="card blue">
      <div class="card-label">Sem Montagem</div>
      <div class="card-value">${dvNoAssembly}</div>
    </div>
  </div>

  <!-- Block 5: Alterações de vencimento -->
  <div class="block-title">5. Alterações de Data de Vencimento</div>
  <div class="cards">
    <div class="card ${dcTotal > 0 ? 'orange' : 'gray'}">
      <div class="card-label">Total de Alterações</div>
      <div class="card-value">${dcTotal}</div>
    </div>
  </div>
  ${dateChanges.length > 0 ? `<table>
    <thead><tr><th>Usuário</th><th class="c">Alterações</th></tr></thead>
    <tbody>
      ${dcRows}
      <tr class="total-row"><td>TOTAL</td><td class="c">${dcTotal}</td></tr>
    </tbody>
  </table>` : '<p style="color:#888;font-size:10px;padding:4px 0">Nenhuma alteração registrada no período.</p>'}

  <!-- Block 6: Cancelamentos -->
  <div class="block-title">6. Vendas Canceladas no Período</div>
  <div class="cards">
    <div class="card ${cnCount > 0 ? 'red' : 'gray'}">
      <div class="card-label">Qtd Canceladas</div>
      <div class="card-value">${cnCount}</div>
    </div>
    <div class="card ${cnCount > 0 ? 'red' : 'gray'}">
      <div class="card-label">Valor Cancelado</div>
      <div class="card-value">${brl(cnTotal)}</div>
    </div>
  </div>

  <!-- ══════════════ FOTO ATUAL ══════════════ -->
  <div class="snapshot-wrapper">
    <div class="snapshot-badge">FOTO ATUAL — NÃO DO PERÍODO</div>
    <div class="snapshot-warning">
      Estes dados refletem a situação atual do sistema no momento da geração deste relatório (${nowStr}).
      Não correspondem ao estado do crediário em ${monthLabel}.
    </div>
    <div class="snapshot-title">7. Situação Atual do Crediário</div>
    <div class="cards">
      <div class="card main">
        <div class="card-label">Total a Receber</div>
        <div class="card-value">${brl(rvTotal)}</div>
      </div>
      <div class="card red">
        <div class="card-label">Em Atraso</div>
        <div class="card-value">${brl(odTotal)}</div>
        <div class="card-sub">${odCount} parcela${odCount !== 1 ? 's' : ''} vencidas</div>
      </div>
      <div class="card orange">
        <div class="card-label">Em Processo Legal</div>
        <div class="card-value">${brl(prTotal)}</div>
        <div class="card-sub">${prClients} cliente${prClients !== 1 ? 's' : ''}</div>
      </div>
      <div class="card teal">
        <div class="card-label">Em Acordo</div>
        <div class="card-value">${brl(agTotal)}</div>
        <div class="card-sub">${agClients} cliente${agClients !== 1 ? 's' : ''}</div>
      </div>
    </div>
  </div>

  <div class="footer">Amor Infinito Enxovais — Relatório Geral · ${monthLabel} · Gerado em ${nowStr}</div>
</body>
</html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
