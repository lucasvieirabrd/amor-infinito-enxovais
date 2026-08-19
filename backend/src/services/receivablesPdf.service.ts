import { db } from '../database';
import { sql } from 'drizzle-orm';
import puppeteer from 'puppeteer';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

interface DayRow   { dia: number; valor_a_receber: string; qtd_parcelas: number }
interface TotalRow { val: string; qty: number }

export async function generateReceivablesPdf(month: number, year: number): Promise<Buffer> {
  const firstDayStr = `${year}-${pad2(month)}-01`;

  // Bloco 1 — grid diário: parcelas com vencimento no mês selecionado, em aberto
  const [dailyResult] = await db.execute(sql`
    SELECT
      DAY(CONVERT_TZ(due_date, '+00:00', '-03:00'))    AS dia,
      SUM(original_amount - paid_amount)               AS valor_a_receber,
      COUNT(*)                                          AS qtd_parcelas
    FROM installments
    WHERE deleted_at IS NULL
      AND status IN ('pending', 'overdue', 'partial')
      AND YEAR(CONVERT_TZ(due_date, '+00:00', '-03:00'))  = ${year}
      AND MONTH(CONVERT_TZ(due_date, '+00:00', '-03:00')) = ${month}
    GROUP BY dia
    ORDER BY dia
  `);

  // Bloco 2 — atrasado de meses anteriores (not included in monthly total)
  const [overdueResult] = await db.execute(sql`
    SELECT
      COALESCE(SUM(original_amount - paid_amount), 0) AS val,
      COUNT(*)                                         AS qty
    FROM installments
    WHERE deleted_at IS NULL
      AND status IN ('pending', 'overdue', 'partial')
      AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < ${firstDayStr}
  `);

  // Bloco 3 — já recebido no mês (pagamentos com payment_date no mês)
  const [receivedResult] = await db.execute(sql`
    SELECT
      COALESCE(SUM(paid_amount), 0) AS val,
      COUNT(*)                       AS qty
    FROM installments
    WHERE deleted_at IS NULL
      AND paid_amount > 0
      AND payment_date IS NOT NULL
      AND YEAR(CONVERT_TZ(payment_date, '+00:00', '-03:00'))  = ${year}
      AND MONTH(CONVERT_TZ(payment_date, '+00:00', '-03:00')) = ${month}
  `);

  const daily  = dailyResult   as unknown as DayRow[];
  const od     = ((overdueResult  as unknown as TotalRow[]))[0] ?? { val: '0', qty: 0 };
  const rec    = ((receivedResult as unknown as TotalRow[]))[0] ?? { val: '0', qty: 0 };

  const totalAReceber = daily.reduce((s, r) => s + parseFloat(String(r.valor_a_receber || 0)), 0);
  const totalQtd      = daily.reduce((s, r) => s + Number(r.qtd_parcelas), 0);
  const totalAtrasado = parseFloat(String(od.val  || 0));
  const qtdAtrasado   = Number(od.qty  || 0);
  const totalRecebido = parseFloat(String(rec.val || 0));
  const qtdRecebido   = Number(rec.qty || 0);

  const nowStr = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const monthLabel = `${MONTH_NAMES[month - 1]} de ${year}`;

  // Determine today in SP to mark overdue days
  const todaySp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const curYear  = todaySp.getFullYear();
  const curMonth = todaySp.getMonth() + 1;
  const curDay   = todaySp.getDate();

  const monthIsPast    = year < curYear || (year === curYear && month < curMonth);
  const monthIsCurrent = year === curYear && month === curMonth;

  const rows = daily.map(r => {
    const dia   = Number(r.dia);
    const valor = parseFloat(String(r.valor_a_receber || 0));
    const qtd   = Number(r.qtd_parcelas);
    const isOverdue = monthIsPast || (monthIsCurrent && dia < curDay);
    return { dia, valor, qtd, isOverdue };
  });

  const rowsHtml = rows.map(r => `
    <tr class="${r.isOverdue ? 'overdue-row' : ''}">
      <td>${pad2(r.dia)}/${pad2(month)}/${year}${r.isOverdue ? ' <span class="badge">vencida</span>' : ''}</td>
      <td class="r">${brl(r.valor)}</td>
      <td class="c">${r.qtd}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 36px; }

    .header { border-bottom: 2px solid #9d174d; padding-bottom: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-start; }
    .store-name  { font-size: 18px; font-weight: bold; color: #9d174d; }
    .report-title{ font-size: 14px; font-weight: 600; color: #444; margin-top: 4px; }
    .report-month{ font-size: 12px; color: #666; margin-top: 2px; }
    .meta        { font-size: 9px; color: #666; }

    .summary { display: flex; gap: 14px; margin-bottom: 24px; }
    .sc { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .sc.main    { border-color: #9d174d; background: #fff5f8; }
    .sc.danger  { border-color: #fca5a5; background: #fff8f8; }
    .sc.success { border-color: #86efac; background: #f0fdf4; }
    .sc-label { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
    .sc-value { font-size: 20px; font-weight: bold; line-height: 1; }
    .sc.main   .sc-value { color: #9d174d; }
    .sc.danger .sc-value { color: #b91c1c; }
    .sc.success .sc-value { color: #15803d; }
    .sc-sub  { font-size: 9px; color: #999; margin-top: 5px; }
    .sc-note { font-size: 8px; color: #aaa; font-style: italic; margin-top: 3px; }

    .section-title { font-size: 10px; font-weight: bold; color: #9d174d; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #f3e8ee; padding-bottom: 4px; margin-bottom: 10px; }

    table { width: 100%; border-collapse: collapse; }
    thead th { background: #9d174d; color: #fff; padding: 8px 14px; font-size: 10px; text-align: left; }
    thead th.r { text-align: right; }
    thead th.c { text-align: center; }
    tbody td { padding: 7px 14px; border-bottom: 1px solid #f0f0f0; }
    tbody td.r { text-align: right; }
    tbody td.c { text-align: center; }
    tbody tr.overdue-row td { color: #b91c1c; background: #fff8f8; }
    tbody tr.total-row td { background: #fdf2f8; font-weight: bold; border-top: 2px solid #9d174d; }
    .badge { font-size: 8px; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 3px; padding: 1px 5px; margin-left: 6px; font-weight: bold; }

    .empty { color: #888; font-size: 11px; padding: 12px 0; }
    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8px; color: #bbb; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">Amor Infinito Enxovais</div>
      <div class="report-title">Recebíveis do Crediário</div>
      <div class="report-month">${monthLabel}</div>
    </div>
    <div style="text-align:right;">
      <div class="meta">Gerado em: <strong>${nowStr}</strong></div>
    </div>
  </div>

  <div class="summary">
    <div class="sc main">
      <div class="sc-label">Total a receber no mês</div>
      <div class="sc-value">${brl(totalAReceber)}</div>
      <div class="sc-sub">${totalQtd} parcela${totalQtd !== 1 ? 's' : ''} com vencimento em ${monthLabel}</div>
    </div>
    <div class="sc danger">
      <div class="sc-label">Atrasado de meses anteriores</div>
      <div class="sc-value">${brl(totalAtrasado)}</div>
      <div class="sc-sub">${qtdAtrasado} parcela${qtdAtrasado !== 1 ? 's' : ''} com vencimento anterior a ${monthLabel}</div>
      <div class="sc-note">Valor em aberto de vencimentos anteriores — não incluído no total diário do mês</div>
    </div>
    ${totalRecebido > 0 ? `
    <div class="sc success">
      <div class="sc-label">Já recebido neste mês</div>
      <div class="sc-value">${brl(totalRecebido)}</div>
      <div class="sc-sub">${qtdRecebido} lançamento${qtdRecebido !== 1 ? 's' : ''} com pagamento em ${monthLabel}</div>
    </div>` : ''}
  </div>

  <div class="section-title">Previsão Diária — ${monthLabel}</div>

  ${rows.length === 0
    ? `<p class="empty">Nenhuma parcela com vencimento neste mês.</p>`
    : `<table>
    <thead>
      <tr>
        <th>Data de Vencimento</th>
        <th class="r">Valor a Receber</th>
        <th class="c">Qtd Parcelas</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td>TOTAL DO MÊS</td>
        <td class="r">${brl(totalAReceber)}</td>
        <td class="c">${totalQtd}</td>
      </tr>
    </tbody>
  </table>`}

  <div class="footer">Amor Infinito Enxovais — Recebíveis do Crediário · ${monthLabel} · Gerado em ${nowStr}</div>
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
