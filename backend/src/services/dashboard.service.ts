import { db } from '../database';
import { sql } from 'drizzle-orm';
import { differenceInDays, subDays, subYears, format } from 'date-fns';
import puppeteer from 'puppeteer';

type CompareTo = 'previous' | 'year_ago' | 'none';

interface MetricsParams {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  compareTo: CompareTo;
}

export class DashboardService {
  async getSalesMetrics({ start, end, compareTo }: MetricsParams) {
    const [salesData, billingData, salesByDay, topProducts] = await Promise.all([
      this.querySalesData(start, end),
      this.queryBillingData(start, end),
      this.querySalesByDay(start, end),
      this.queryTopProducts(start, end),
    ]);

    let comparison: typeof salesData | undefined;
    if (compareTo !== 'none') {
      const comp = this.computeComparisonPeriod(start, end, compareTo);
      comparison = await this.querySalesData(comp.start, comp.end);
    }

    return {
      period: { start, end },
      sales: salesData,
      comparison,
      billing: billingData,
      salesByDay,
      topProducts,
    };
  }

  private computeComparisonPeriod(start: string, end: string, compareTo: CompareTo) {
    // T12:00:00 evita que meia-noite seja interpretada como dia anterior em UTC-3
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const days = differenceInDays(e, s);

    if (compareTo === 'previous') {
      const compEnd = subDays(s, 1);
      const compStart = subDays(compEnd, days);
      return {
        start: format(compStart, 'yyyy-MM-dd'),
        end: format(compEnd, 'yyyy-MM-dd'),
      };
    } else {
      return {
        start: format(subYears(s, 1), 'yyyy-MM-dd'),
        end: format(subYears(e, 1), 'yyyy-MM-dd'),
      };
    }
  }

  private async querySalesData(start: string, end: string) {
    const [result, customersResult] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(SUM(total_amount), 0)                                                             AS total,
          COALESCE(SUM(CASE WHEN payment_method = 'cash'         THEN total_amount ELSE 0 END), 0)  AS cash_total,
          COUNT(CASE WHEN payment_method = 'cash'         THEN 1 END)                               AS cash_count,
          COALESCE(SUM(CASE WHEN payment_method = 'credit_card'  THEN total_amount ELSE 0 END), 0)  AS card_total,
          COUNT(CASE WHEN payment_method = 'credit_card'  THEN 1 END)                               AS card_count,
          COALESCE(SUM(CASE WHEN payment_method = 'installment'  THEN total_amount ELSE 0 END), 0)  AS inst_total,
          COUNT(CASE WHEN payment_method = 'installment'  THEN 1 END)                               AS inst_count
        FROM sales
        WHERE deleted_at IS NULL
          AND is_imported = 0
          AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) >= ${start}
          AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) <= ${end}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL
      `),
    ]);

    const r  = (result[0]          as any[])[0];
    const cu = (customersResult[0] as any[])[0];
    const toF = (v: any) => parseFloat(v?.toString() ?? '0') || 0;
    const toN = (v: any) => parseInt(v?.toString() ?? '0')   || 0;

    return {
      total:         toF(r?.total),
      cash:          { total: toF(r?.cash_total), count: toN(r?.cash_count) },
      creditCard:    { total: toF(r?.card_total), count: toN(r?.card_count) },
      installment:   { total: toF(r?.inst_total), count: toN(r?.inst_count) },
      totalCustomers: toN(cu?.count),
    };
  }

  private async queryBillingData(start: string, end: string) {
    const [receivableResult, overdueResult, receivedResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS count,
               COALESCE(SUM(original_amount - COALESCE(paid_amount, 0)), 0) AS total
        FROM installments
        WHERE status IN ('pending', 'overdue', 'partial')
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*) AS count,
               COALESCE(SUM(original_amount), 0) AS total
        FROM installments
        WHERE (
          status = 'overdue'
          OR (status = 'pending'
              AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))
        )
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(paid_amount), 0)                                                              AS total,
          COALESCE(SUM(CASE WHEN installment_number > 0 THEN paid_amount ELSE 0 END), 0)             AS installments_total,
          COALESCE(SUM(CASE WHEN installment_number = 0 THEN paid_amount ELSE 0 END), 0)             AS entries_total
        FROM installments
        WHERE status = 'paid'
          AND deleted_at IS NULL
          AND DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00')) >= ${start}
          AND DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00')) <= ${end}
      `),
    ]);

    const toF = (v: any) => parseFloat(v?.toString() ?? '0') || 0;
    const toN = (v: any) => parseInt(v?.toString() ?? '0')   || 0;

    const rec = (receivableResult[0] as any[])[0];
    const ovd = (overdueResult[0]    as any[])[0];
    const rcv = (receivedResult[0]   as any[])[0];

    return {
      totalReceivable:   { total: toF(rec?.total), count: toN(rec?.count) },
      overdue:           { total: toF(ovd?.total), count: toN(ovd?.count) },
      receivedThisMonth: {
        total:              toF(rcv?.total),
        installmentsTotal:  toF(rcv?.installments_total),
        entriesTotal:       toF(rcv?.entries_total),
      },
    };
  }

  private async querySalesByDay(start: string, end: string) {
    const result = await db.execute(sql`
      SELECT
        DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) AS day,
        COALESCE(SUM(total_amount), 0)                  AS total
      FROM sales
      WHERE deleted_at IS NULL
        AND is_imported = 0
        AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) >= ${start}
        AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) <= ${end}
      GROUP BY DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00'))
      ORDER BY day ASC
    `);

    return (result[0] as any[]).map(row => ({
      day:   row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
      total: parseFloat(row.total?.toString() ?? '0') || 0,
    }));
  }

  private async queryTopProducts(start: string, end: string) {
    const result = await db.execute(sql`
      SELECT
        p.name,
        p.sku,
        SUM(si.quantity)    AS total_qty,
        SUM(si.total_price) AS total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales    s ON si.sale_id    = s.id
      WHERE s.deleted_at IS NULL
        AND s.is_imported = 0
        AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) >= ${start}
        AND DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) <= ${end}
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_qty DESC
      LIMIT 5
    `);

    return (result[0] as any[]).map(row => ({
      name:         row.name,
      sku:          row.sku ?? '',
      totalQty:     parseInt(row.total_qty?.toString()     ?? '0') || 0,
      totalRevenue: parseFloat(row.total_revenue?.toString() ?? '0') || 0,
    }));
  }

  // ── Relatório financeiro ─────────────────────────────────────────────────────

  async getReportData(startDate: string, endDate: string) {
    const toF = (v: any) => parseFloat(v?.toString() ?? '0') || 0;
    const toN = (v: any) => parseInt(v?.toString()   ?? '0') || 0;

    const [salesResult, receivedResult, receivableResult, overdueResult] = await Promise.all([
      // Bloco A: vendas por forma de pagamento no período + contagem para ticket médio
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'cash'        THEN total_amount ELSE 0 END), 0) AS cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'credit_card' THEN total_amount ELSE 0 END), 0) AS card_total,
          COALESCE(SUM(CASE WHEN payment_method = 'installment' THEN total_amount ELSE 0 END), 0) AS inst_total,
          COALESCE(SUM(total_amount), 0) AS total,
          COUNT(*) AS sale_count
        FROM sales
        WHERE deleted_at IS NULL
          AND is_imported = 0
          AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) >= ${startDate}
          AND DATE(CONVERT_TZ(sale_date, '+00:00', '-03:00')) <= ${endDate}
      `),
      // Bloco B: parcelas pagas no período — mesma lógica do queryBillingData
      // installment_number = 0 → entrada; >= 1 → parcela de crediário
      db.execute(sql`
        SELECT
          COUNT(*)                                                                               AS count,
          COALESCE(SUM(paid_amount), 0)                                                         AS total,
          COALESCE(SUM(CASE WHEN installment_number >= 1 THEN paid_amount ELSE 0 END), 0)       AS installments_total,
          COUNT(CASE WHEN installment_number >= 1 THEN 1 END)                                   AS installments_count,
          COALESCE(SUM(CASE WHEN installment_number = 0 THEN paid_amount ELSE 0 END), 0)        AS entries_total,
          COUNT(CASE WHEN installment_number = 0 THEN 1 END)                                    AS entries_count
        FROM installments
        WHERE status = 'paid'
          AND deleted_at IS NULL
          AND DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00')) >= ${startDate}
          AND DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00')) <= ${endDate}
      `),
      // Bloco C: total a receber (foto do momento — mesmo cálculo do dashboard)
      db.execute(sql`
        SELECT COUNT(*) AS count,
               COALESCE(SUM(original_amount - COALESCE(paid_amount, 0)), 0) AS total
        FROM installments
        WHERE status IN ('pending', 'overdue', 'partial')
          AND deleted_at IS NULL
      `),
      // Bloco D: em atraso (foto do momento — mesma definição do dashboard)
      db.execute(sql`
        SELECT COUNT(*) AS count,
               COALESCE(SUM(original_amount - COALESCE(paid_amount, 0)), 0) AS total
        FROM installments
        WHERE (
          status = 'overdue'
          OR (status = 'pending'
              AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))
        )
          AND deleted_at IS NULL
      `),
    ]);

    const s   = (salesResult[0]      as any[])[0];
    const rcv = (receivedResult[0]   as any[])[0];
    const rec = (receivableResult[0] as any[])[0];
    const ovd = (overdueResult[0]    as any[])[0];

    const saleCount  = toN(s?.sale_count);
    const saleTotal  = toF(s?.total);
    const avgTicket  = saleCount > 0 ? saleTotal / saleCount : 0;

    const receivedTotal        = toF(rcv?.total);
    const installmentsTotal    = toF(rcv?.installments_total);
    const entriesTotal         = toF(rcv?.entries_total);
    const partialSum           = Math.round((installmentsTotal + entriesTotal) * 100);
    const expectedTotal        = Math.round(receivedTotal * 100);
    if (partialSum !== expectedTotal) {
      console.warn(
        `[report] received breakdown mismatch: installments(${installmentsTotal}) + entries(${entriesTotal}) = ${(partialSum / 100).toFixed(2)} ≠ total(${receivedTotal})`,
      );
    }

    return {
      period:     { start: startDate, end: endDate },
      sales: {
        cash:        toF(s?.cash_total),
        creditCard:  toF(s?.card_total),
        installment: toF(s?.inst_total),
        total:       saleTotal,
        count:       saleCount,
        avgTicket,
      },
      received: {
        total: receivedTotal,
        count: toN(rcv?.count),
        installments: { total: installmentsTotal, count: toN(rcv?.installments_count) },
        entries:      { total: entriesTotal,      count: toN(rcv?.entries_count) },
      },
      receivable: { total: toF(rec?.total), count: toN(rec?.count) },
      overdue:    { total: toF(ovd?.total), count: toN(ovd?.count) },
    };
  }
}

// ── PDF do relatório financeiro ──────────────────────────────────────────────

type ReportData = Awaited<ReturnType<DashboardService['getReportData']>>;

export async function generateDashboardReportPdf(data: ReportData): Promise<Buffer> {
  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const nowStr = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const sd = fmtDate(data.period.start);
  const ed = fmtDate(data.period.end);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 36px; }

    .header { border-bottom: 2px solid #9d174d; padding-bottom: 14px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .store-name { font-size: 18px; font-weight: bold; color: #9d174d; }
    .report-title { font-size: 13px; font-weight: 600; color: #444; margin-top: 4px; }
    .meta { font-size: 9px; color: #666; margin-top: 6px; }
    .header-right { text-align: right; }

    .section { margin-bottom: 26px; }
    .section-title { font-size: 12px; font-weight: bold; color: #9d174d; border-bottom: 1px solid #f3e8ee; padding-bottom: 4px; margin-bottom: 6px; }
    .section-sub { font-size: 9px; color: #888; font-style: italic; margin-bottom: 10px; }

    table { width: 100%; border-collapse: collapse; }
    thead th { background: #9d174d; color: #fff; padding: 7px 14px; text-align: left; font-size: 10px; }
    thead th.r { text-align: right; }
    tbody td { padding: 7px 14px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
    tbody td.r { text-align: right; }
    tbody tr.total-row td { background: #fdf2f8; font-weight: bold; border-top: 2px solid #9d174d; }

    .cards { display: flex; gap: 16px; }
    .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; }
    .card-label { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; }
    .card-value { font-size: 20px; font-weight: bold; color: #111; }
    .card-sub { font-size: 9px; color: #999; margin-top: 4px; }
    .card.danger { border-color: #fca5a5; background: #fff8f8; }
    .card.danger .card-value { color: #b91c1c; }
    .card.info .card-value { color: #1d4ed8; }

    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8px; color: #bbb; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">Amor Infinito Enxovais</div>
      <div class="report-title">Relatório Financeiro</div>
      <div class="meta">Período: <strong>${sd} a ${ed}</strong></div>
    </div>
    <div class="header-right">
      <div class="meta">Gerado em: <strong>${nowStr}</strong></div>
    </div>
  </div>

  <!-- Bloco A: Vendas no período -->
  <div class="section">
    <div class="section-title">Vendas no Período</div>
    <div class="section-sub">Vendas realizadas entre ${sd} e ${ed} — exclui importações.</div>
    <table>
      <thead>
        <tr>
          <th>Forma de Pagamento</th>
          <th class="r">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>À Vista</td><td class="r">${brl(data.sales.cash)}</td></tr>
        <tr><td>Cartão de Crédito</td><td class="r">${brl(data.sales.creditCard)}</td></tr>
        <tr><td>Crediário</td><td class="r">${brl(data.sales.installment)}</td></tr>
        <tr class="total-row"><td>Total Geral</td><td class="r">${brl(data.sales.total)}</td></tr>
        <tr><td style="color:#555;">Quantidade de vendas</td><td class="r" style="color:#555;">${data.sales.count} venda${data.sales.count !== 1 ? 's' : ''}</td></tr>
        <tr><td style="color:#555;">Ticket médio</td><td class="r" style="color:#555;">${brl(data.sales.avgTicket)}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Bloco B: Recebimentos no período -->
  <div class="section">
    <div class="section-title">Recebimentos no Período</div>
    <div class="section-sub">Parcelas e entradas pagas entre ${sd} e ${ed} — a soma das origens abaixo iguala o total recebido.</div>
    <div class="cards" style="margin-bottom:12px;">
      <div class="card info">
        <div class="card-label">Total Recebido</div>
        <div class="card-value">${brl(data.received.total)}</div>
        <div class="card-sub">${data.received.count} lançamento${data.received.count !== 1 ? 's' : ''} recebido${data.received.count !== 1 ? 's' : ''} no período</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Origem</th>
          <th class="r">Valor</th>
          <th class="r">Qtd</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Parcelas de crediário</td>
          <td class="r">${brl(data.received.installments.total)}</td>
          <td class="r">${data.received.installments.count}</td>
        </tr>
        <tr>
          <td>Entradas (pagamento à vista)</td>
          <td class="r">${brl(data.received.entries.total)}</td>
          <td class="r">${data.received.entries.count}</td>
        </tr>
        <tr class="total-row">
          <td>Total</td>
          <td class="r">${brl(data.received.total)}</td>
          <td class="r">${data.received.count}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Bloco C + D: Situação atual -->
  <div class="section">
    <div class="section-title">Situação Atual (Saldo)</div>
    <div class="section-sub">Foto do momento — independente do período selecionado.</div>
    <div class="cards">
      <div class="card">
        <div class="card-label">Total a Receber</div>
        <div class="card-value">${brl(data.receivable.total)}</div>
        <div class="card-sub">${data.receivable.count} parcela${data.receivable.count !== 1 ? 's' : ''} em aberto (pendente, parcial ou vencida)</div>
      </div>
      <div class="card danger">
        <div class="card-label">Parcelas em Atraso</div>
        <div class="card-value">${brl(data.overdue.total)}</div>
        <div class="card-sub">${data.overdue.count} parcela${data.overdue.count !== 1 ? 's' : ''} vencida${data.overdue.count !== 1 ? 's' : ''} sem pagamento</div>
      </div>
    </div>
  </div>

  <div class="footer">Amor Infinito Enxovais — Relatório confidencial · Gerado automaticamente em ${nowStr}</div>
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
