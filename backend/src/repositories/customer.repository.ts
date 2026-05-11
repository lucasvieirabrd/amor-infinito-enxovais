import { db } from '../database';
import { customers } from '../database/schema';
import { eq, and, isNull, or, ne, like, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class CustomerRepository {
  async findByCpf(cpf: string, excludeId?: string) {
    const conditions = [eq(customers.cpf, cpf), isNull(customers.deletedAt)];
    if (excludeId) conditions.push(ne(customers.id, excludeId));
    const result = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async findByPhone(phone: string, excludeId?: string) {
    const digits = phone.replace(/\D/g, '');
    // Build variants: exact digits, with 55, without 55 — to handle format mismatches
    const variants = new Set([digits]);
    if (digits.startsWith('55')) variants.add(digits.slice(2));
    else variants.add(`55${digits}`);

    const phoneConditions = [...variants].map(v => eq(customers.phone, v));
    const whereClause = excludeId
      ? and(isNull(customers.deletedAt), ne(customers.id, excludeId), or(...phoneConditions))
      : and(isNull(customers.deletedAt), or(...phoneConditions));
    const result = await db
      .select()
      .from(customers)
      .where(whereClause)
      .limit(1);
    return result[0];
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    
    let query = db
      .select()
      .from(customers)
      .where(isNull(customers.deletedAt));

    if (search) {
      query = db
        .select()
        .from(customers)
        .where(
          and(
            isNull(customers.deletedAt),
            or(
              like(customers.name, `%${search}%`),
              like(customers.cpf, `%${search}%`),
              like(customers.phone, `%${search}%`)
            )
          )
        );
    }

    const data = await query.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(
        search 
          ? and(
              isNull(customers.deletedAt),
              or(
                like(customers.name, `%${search}%`),
                like(customers.cpf, `%${search}%`),
                like(customers.phone, `%${search}%`)
              )
            )
          : isNull(customers.deletedAt)
      );

    const totalPages = Math.ceil(countResult[0].count / limit);
    
    return {
      data,
      total: countResult[0].count,
      page,
      limit,
      totalPages,
    };
  }

  async create(data: any) {
    const id = uuidv4();
    await db.insert(customers).values({
      ...data,
      id,
    });
    return this.findById(id);
  }

  async update(id: string, data: any) {
    await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id));
    return this.findById(id);
  }

  async delete(id: string) {
    await db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, id));
  }

  async countMergeableRecords(duplicateId: string) {
    const [instRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM installments WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `) as any;
    const [saleRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM sales WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `) as any;
    const [msgRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM messages WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `) as any;

    return {
      installments: Number(instRows[0].cnt),
      sales: Number(saleRows[0].cnt),
      messages: Number(msgRows[0].cnt),
    };
  }

  async mergeCustomers(primaryId: string, duplicateId: string, mergedData: any) {
    // Garble duplicate's unique fields first to release constraints before updating primary
    const garbledPhone = `D${duplicateId.slice(0, 19)}`;
    const garbledCpf   = `D${duplicateId.slice(0, 13)}`;

    await db.execute(sql`
      UPDATE customers SET phone = ${garbledPhone}, cpf = ${garbledCpf} WHERE id = ${duplicateId}
    `);

    await db
      .update(customers)
      .set({ ...mergedData, updatedAt: new Date() })
      .where(eq(customers.id, primaryId));

    await db.execute(sql`
      UPDATE installments SET customer_id = ${primaryId}, updated_at = NOW()
      WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `);

    await db.execute(sql`
      UPDATE sales SET customer_id = ${primaryId}, updated_at = NOW()
      WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `);

    await db.execute(sql`
      UPDATE messages SET customer_id = ${primaryId}
      WHERE customer_id = ${duplicateId} AND deleted_at IS NULL
    `);

    await db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, duplicateId));
  }
}
