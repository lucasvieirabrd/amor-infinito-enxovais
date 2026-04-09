import { db } from '../database';
import { installments, customers, sales } from '../database/schema';
import { eq, and, isNull, lt, gte, sql, or } from 'drizzle-orm';

export class InstallmentRepository {
  async findById(id: string) {
    const result = await db
      .select()
      .from(installments)
      .where(and(eq(installments.id, id), isNull(installments.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByCustomer(customerId: string) {
    return db
      .select()
      .from(installments)
      .where(and(eq(installments.customerId, customerId), isNull(installments.deletedAt)))
      .orderBy(installments.dueDate);
  }

  async listOverdue() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return db
      .select({
        installment: installments,
        customer: customers,
      })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          eq(installments.status, 'pending'),
          lt(installments.dueDate, today),
          isNull(installments.deletedAt)
        )
      )
      .orderBy(installments.dueDate);
  }

  async update(id: string, data: any) {
    await db
      .update(installments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(installments.id, id));
    return this.findById(id);
  }

  async listActiveCrediarios() {
    return db
      .selectDistinct({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .innerJoin(installments, eq(customers.id, installments.customerId))
      .where(
        and(
          or(eq(installments.status, 'pending'), eq(installments.status, 'overdue')),
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );
  }

  async listActiveCrediariosPaginated(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    
    let whereClause = and(
      or(eq(installments.status, 'pending'), eq(installments.status, 'overdue')),
      isNull(installments.deletedAt),
      isNull(customers.deletedAt)
    );

    const data = await db
      .selectDistinct({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .innerJoin(installments, eq(customers.id, installments.customerId))
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(distinct ${customers.id})` })
      .from(customers)
      .innerJoin(installments, eq(customers.id, installments.customerId))
      .where(whereClause);

    const totalPages = Math.ceil(countResult[0].count / limit);

    return {
      data,
      total: countResult[0].count,
      page,
      limit,
      totalPages,
    };
  }

  async listPendingOverdue() {
    return db
      .select({
        installment: installments,
        customer: customers,
      })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          or(eq(installments.status, 'pending'), eq(installments.status, 'overdue')),
          isNull(installments.deletedAt)
        )
      )
      .orderBy(installments.dueDate);
  }

  async getStats() {
    const [overdueResult, todayResult, inDayResult, receivableResult, receivedResult, customersResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) as count, SUM(original_amount) as total
        FROM installments
        WHERE status = 'overdue'
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*) as count, SUM(original_amount) as total
        FROM installments
        WHERE status = 'pending'
          AND DATE(due_date) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*) as count, SUM(original_amount) as total
        FROM installments
        WHERE status = 'pending'
          AND DATE(due_date) > DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*) as count, COALESCE(SUM(original_amount - paid_amount), 0) as total
        FROM installments
        WHERE status IN ('pending', 'overdue')
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COALESCE(SUM(paid_amount), 0) as total
        FROM installments
        WHERE status = 'paid'
          AND deleted_at IS NULL
          AND YEAR(CONVERT_TZ(payment_date, '+00:00', '-03:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND MONTH(CONVERT_TZ(payment_date, '+00:00', '-03:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
      `),
      db.execute(sql`
        SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL
      `),
    ]);

    const toNum = (v: any) => Number(v ?? 0);
    const toFloat = (v: any) => parseFloat(v?.toString() ?? '0') || 0;

    const o  = (overdueResult[0]    as any[])[0];
    const t  = (todayResult[0]      as any[])[0];
    const d  = (inDayResult[0]      as any[])[0];
    const r  = (receivableResult[0] as any[])[0];
    const rc = (receivedResult[0]   as any[])[0];
    const cu = (customersResult[0]  as any[])[0];

    return {
      overdue:           { count: toNum(o?.count),  total: toFloat(o?.total) },
      pendingToday:      { count: toNum(t?.count),  total: toFloat(t?.total) },
      inDay:             { count: toNum(d?.count),  total: toFloat(d?.total) },
      totalReceivable:   { count: toNum(r?.count),  total: toFloat(r?.total) },
      receivedThisMonth: { total: toFloat(rc?.total) },
      totalCustomers:    toNum(cu?.count),
    };
  }

  async getPaymentsLast30Days() {
    const result = await db.execute(sql`
      SELECT
        DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00')) as day,
        SUM(paid_amount) as total
      FROM installments
      WHERE status = 'paid'
        AND deleted_at IS NULL
        AND payment_date >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')), INTERVAL 29 DAY)
      GROUP BY DATE(CONVERT_TZ(payment_date, '+00:00', '-03:00'))
      ORDER BY day ASC
    `);
    return (result[0] as any[]).map(row => ({
      day: row.day,
      total: parseFloat(row.total?.toString() ?? '0') || 0,
    }));
  }
}
