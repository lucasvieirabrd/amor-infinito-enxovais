import { db } from '../database';
import { installments, customers, sales } from '../database/schema';
import { eq, and, isNull, lt, gte, sql, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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
          or(eq(installments.status, 'pending'), eq(installments.status, 'overdue'), eq(installments.status, 'partial')),
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );
  }

  async listActiveCrediariosPaginated(page: number, limit: number, search?: string, filter?: string) {
    const offset = (page - 1) * limit;

    const searchCond = search
      ? sql`AND (c.name LIKE ${'%' + search + '%'} OR c.phone LIKE ${'%' + search + '%'})`
      : sql``;

    // HAVING usa os mesmos critérios das colunas computadas overdueCount/todayCount
    const filterHaving = filter === 'overdue'
      ? sql`HAVING overdueCount > 0`
      : filter === 'today'
        ? sql`HAVING todayCount > 0 AND overdueCount = 0`
        : filter === 'current'
          ? sql`HAVING overdueCount = 0 AND todayCount = 0`
          : sql``;

    const dataResult = await db.execute(sql`
      SELECT
        c.id,
        c.name,
        c.phone,
        COUNT(i.id) AS installmentCount,
        COALESCE(SUM(i.original_amount - COALESCE(i.paid_amount, 0)), 0) AS totalPending,
        SUM(CASE
          WHEN i.status = 'overdue'
            OR (i.status IN ('pending','partial') AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))
          THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE
          WHEN i.status IN ('pending','partial')
            AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN 1 ELSE 0 END) AS todayCount,
        dca.lastDateChangeAt,
        dca.dateChangeCount
      FROM customers c
      INNER JOIN installments i ON c.id = i.customer_id
      LEFT JOIN (
        SELECT
          i2.customer_id,
          MAX(al.timestamp) AS lastDateChangeAt,
          COUNT(*)          AS dateChangeCount
        FROM audit_logs al
        JOIN installments i2 ON i2.id = al.entity_id AND i2.deleted_at IS NULL
        WHERE al.entity_type = 'Installment'
          AND (
            al.action = 'UPDATE_INSTALLMENT_DATE'
            OR (
              al.action = 'UPDATE_INSTALLMENT'
              AND al.old_value IS NOT NULL
              AND al.new_value IS NOT NULL
              AND JSON_UNQUOTE(JSON_EXTRACT(al.old_value, '$.dueDate')) != JSON_UNQUOTE(JSON_EXTRACT(al.new_value, '$.dueDate'))
            )
          )
        GROUP BY i2.customer_id
      ) dca ON dca.customer_id = c.id
      WHERE (i.status IN ('pending', 'overdue', 'partial'))
        AND i.deleted_at IS NULL
        AND c.deleted_at IS NULL
        ${searchCond}
      GROUP BY c.id, c.name, c.phone, dca.lastDateChangeAt, dca.dateChangeCount
      ${filterHaving}
      ORDER BY overdueCount DESC, c.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Count query usa subquery para aplicar o mesmo HAVING
    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS total FROM (
        SELECT c.id,
          SUM(CASE
            WHEN i.status = 'overdue'
              OR (i.status IN ('pending','partial') AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))
            THEN 1 ELSE 0 END) AS overdueCount,
          SUM(CASE
            WHEN i.status IN ('pending','partial')
              AND DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
            THEN 1 ELSE 0 END) AS todayCount
        FROM customers c
        INNER JOIN installments i ON c.id = i.customer_id
        WHERE (i.status IN ('pending', 'overdue', 'partial'))
          AND i.deleted_at IS NULL
          AND c.deleted_at IS NULL
          ${searchCond}
        GROUP BY c.id
        ${filterHaving}
      ) AS sub
    `);

    const rows = dataResult[0] as any[];
    const total = Number((countResult[0] as any[])[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map(r => ({
        id: String(r.id),
        name: String(r.name),
        phone: String(r.phone),
        installmentCount: Number(r.installmentCount),
        totalPending: parseFloat(r.totalPending?.toString() ?? '0'),
        overdueCount: Number(r.overdueCount),
        todayCount: Number(r.todayCount),
        lastDateChangeAt: r.lastDateChangeAt ? new Date(r.lastDateChangeAt).toISOString() : null,
        dateChangeCount: r.dateChangeCount ? Number(r.dateChangeCount) : 0,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByCustomerFiltered(customerId: string, saleId?: string, onlyPending?: boolean) {
    const conditions: any[] = [
      eq(installments.customerId, customerId),
      isNull(installments.deletedAt),
    ];
    if (saleId) conditions.push(eq(installments.saleId, saleId));
    if (onlyPending) conditions.push(sql`${installments.status} IN ('pending', 'overdue')`);

    return db
      .select()
      .from(installments)
      .where(and(...conditions))
      .orderBy(installments.dueDate);
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
          or(eq(installments.status, 'pending'), eq(installments.status, 'overdue'), eq(installments.status, 'partial')),
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
        WHERE (
          status = 'overdue'
          OR (status = 'pending' AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')))
        )
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
        SELECT COUNT(*) as count, COALESCE(SUM(original_amount - COALESCE(paid_amount, 0)), 0) as total
        FROM installments
        WHERE status IN ('pending', 'overdue', 'partial')
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

  async softDelete(id: string) {
    await db.update(installments).set({ deletedAt: new Date() }).where(eq(installments.id, id));
  }

  async createOne(data: any) {
    const id = uuidv4();
    await db.insert(installments).values({ ...data, id });
    return this.findById(id);
  }
}
