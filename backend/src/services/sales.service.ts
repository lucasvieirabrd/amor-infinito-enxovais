import { db } from "../database";
import { startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, format } from "date-fns";
import { sql } from "drizzle-orm";
import { installments } from "../database/schema";

export class SalesService {
  async getTotalSales(): Promise<number> {
    const now = new Date();
    const firstDayOfMonth = startOfMonth(now);
    const lastDayOfMonth = endOfMonth(now);

    const result = await db.select({
      total: sql<number>`sum(${installments.paidAmount})`,
    })
    .from(installments)
    .where(sql`${installments.status} = 'paid' AND ${installments.paymentDate} >= ${firstDayOfMonth.toISOString()} AND ${installments.paymentDate} <= ${lastDayOfMonth.toISOString()}`);

    return result[0]?.total || 0;
  }

  async getLast7DaysSales(): Promise<{ date: string; total: number }[]> {
    const salesByDay: { date: string; total: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = subDays(now, i);
      const start = startOfDay(date);
      const end = endOfDay(date);

      const result = await db.select({
        total: sql<number>`sum(${installments.paidAmount})`,
      })
      .from(installments)
      .where(sql`${installments.status} = 'paid' AND ${installments.paymentDate} >= ${start.toISOString()} AND ${installments.paymentDate} <= ${end.toISOString()}`);

      salesByDay.push({
        date: format(date, "yyyy-MM-dd"),
        total: result[0]?.total || 0,
      });
    }

    return salesByDay;
  }
}
