import { db } from '../database';
import { installments, customers, sales } from '../database/schema';
import { eq, and, isNull, lt, sql, or } from 'drizzle-orm';

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

  async getStats() {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const overdueResult = await db
      .select({ 
        total: sql<number>`sum(${installments.originalAmount})`,
        count: sql<number>`count(*)`
      })
      .from(installments)
      .where(and(eq(installments.status, 'pending'), lt(installments.dueDate, startOfToday), isNull(installments.deletedAt)));

    const pendingTodayResult = await db
      .select({ 
        total: sql<number>`sum(${installments.originalAmount})`,
        count: sql<number>`count(*)`
      })
      .from(installments)
      .where(and(eq(installments.status, 'pending'), sql`${installments.dueDate} >= ${startOfToday} and ${installments.dueDate} <= ${endOfToday}`, isNull(installments.deletedAt)));

    const inDayResult = await db
      .select({ 
        total: sql<number>`sum(${installments.originalAmount})`,
        count: sql<number>`count(*)`
      })
      .from(installments)
      .where(and(eq(installments.status, 'pending'), sql`${installments.dueDate} > ${endOfToday}`, isNull(installments.deletedAt)));

    return {
      overdue: { 
        total: overdueResult[0].total || 0,
        count: overdueResult[0].count || 0
      },
      pendingToday: { 
        total: pendingTodayResult[0].total || 0,
        count: pendingTodayResult[0].count || 0
      },
      inDay: { 
        total: inDayResult[0].total || 0,
        count: inDayResult[0].count || 0
      }
    };
  }
}
