import { db } from '../database';
import { sql } from 'drizzle-orm';
import { differenceInDays, subDays, subYears, format } from 'date-fns';

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
      this.queryBillingData(),
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

  private async queryBillingData() {
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
        SELECT COALESCE(SUM(paid_amount), 0) AS total
        FROM installments
        WHERE status = 'paid'
          AND deleted_at IS NULL
          AND YEAR(CONVERT_TZ(payment_date, '+00:00', '-03:00'))  = YEAR(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND MONTH(CONVERT_TZ(payment_date, '+00:00', '-03:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
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
      receivedThisMonth: { total: toF(rcv?.total) },
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
}
