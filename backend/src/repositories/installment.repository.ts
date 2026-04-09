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

  async getStats() {
    const [overdueResult, todayResult, inDayResult] = await Promise.all([
      db.select({
        count: sql<number>`count(*)`,
        total: sql<string>`sum(${installments.originalAmount})`
      }).from(installments)
        .where(and(
          eq(installments.status, 'pending'),
          sql`DATE(${installments.dueDate}) < CURDATE()`,
          isNull(installments.deletedAt)
        )),

      db.select({
        count: sql<number>`count(*)`,
        total: sql<string>`sum(${installments.originalAmount})`
      }).from(installments)
        .where(and(
          eq(installments.status, 'pending'),
          sql`DATE(${installments.dueDate}) = CURDATE()`,
          isNull(installments.deletedAt)
        )),

      db.select({
        count: sql<number>`count(*)`,
        total: sql<string>`sum(${installments.originalAmount})`
      }).from(installments)
        .where(and(
          eq(installments.status, 'pending'),
          sql`DATE(${installments.dueDate}) > CURDATE()`,
          isNull(installments.deletedAt)
        )),
    ]);

    return {
      overdue: {
        count: Number(overdueResult[0]?.count ?? 0),
        total: parseFloat(overdueResult[0]?.total?.toString() ?? '0') || 0,
      },
      pendingToday: {
        count: Number(todayResult[0]?.count ?? 0),
        total: parseFloat(todayResult[0]?.total?.toString() ?? '0') || 0,
      },
      inDay: {
        count: Number(inDayResult[0]?.count ?? 0),
        total: parseFloat(inDayResult[0]?.total?.toString() ?? '0') || 0,
      },
    };
  }
}
