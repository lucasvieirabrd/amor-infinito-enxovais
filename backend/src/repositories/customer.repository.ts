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

  async list(page: number, limit: number, search?: string, statusFilter?: string) {
    const offset = (page - 1) * limit;

    const searchCond = search
      ? sql`AND (c.name LIKE ${`%${search}%`} OR c.cpf LIKE ${`%${search}%`} OR c.phone LIKE ${`%${search}%`})`
      : sql``;

    const statusCond =
      statusFilter === 'devendo'
        ? sql`AND COALESCE(inst_agg.pending_count, 0) > 0`
        : statusFilter === 'quitado'
        ? sql`AND COALESCE(inst_agg.pending_count, 0) = 0 AND COALESCE(inst_agg.total_installments, 0) > 0`
        : statusFilter === 'sem_crediario'
        ? sql`AND COALESCE(inst_agg.total_installments, 0) = 0 AND COALESCE(sale_agg.total_sales, 0) > 0`
        : statusFilter === 'sem_compras'
        ? sql`AND COALESCE(sale_agg.total_sales, 0) = 0`
        : sql``;

    const [dataRows] = await db.execute(sql`
      SELECT
        c.id,
        c.name,
        c.cpf,
        c.phone,
        c.email,
        c.address_street       AS addressStreet,
        c.address_number       AS addressNumber,
        c.address_neighborhood AS addressNeighborhood,
        c.address_city         AS addressCity,
        c.address_state        AS addressState,
        c.cep,
        c.created_at           AS createdAt,
        c.updated_at           AS updatedAt,
        CASE
          WHEN COALESCE(inst_agg.pending_count, 0) > 0          THEN 'devendo'
          WHEN COALESCE(inst_agg.total_installments, 0) > 0     THEN 'quitado'
          WHEN COALESCE(sale_agg.total_sales, 0) > 0            THEN 'sem_crediario'
          ELSE 'sem_compras'
        END AS paymentStatus
      FROM customers c
      LEFT JOIN (
        SELECT customer_id,
               COUNT(*) AS total_installments,
               SUM(CASE WHEN status IN ('pending','overdue') THEN 1 ELSE 0 END) AS pending_count
        FROM installments
        WHERE deleted_at IS NULL
        GROUP BY customer_id
      ) inst_agg ON inst_agg.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS total_sales
        FROM sales
        WHERE deleted_at IS NULL
        GROUP BY customer_id
      ) sale_agg ON sale_agg.customer_id = c.id
      WHERE c.deleted_at IS NULL
        ${searchCond}
        ${statusCond}
      ORDER BY c.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as any;

    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM customers c
      LEFT JOIN (
        SELECT customer_id,
               COUNT(*) AS total_installments,
               SUM(CASE WHEN status IN ('pending','overdue') THEN 1 ELSE 0 END) AS pending_count
        FROM installments
        WHERE deleted_at IS NULL
        GROUP BY customer_id
      ) inst_agg ON inst_agg.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS total_sales
        FROM sales
        WHERE deleted_at IS NULL
        GROUP BY customer_id
      ) sale_agg ON sale_agg.customer_id = c.id
      WHERE c.deleted_at IS NULL
        ${searchCond}
        ${statusCond}
    `) as any;

    const total = Number(countRows[0].total);

    return {
      data: dataRows as any[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
