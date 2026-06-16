import { db } from '../database';
import { sales, saleItems, installments, saleSequence, customers, products, sellers } from '../database/schema';
import { eq, and, isNull, sql, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { MySqlTransaction } from 'drizzle-orm/mysql-core';

export class SaleRepository {
  /**
   * Gera o próximo número de venda no formato VEN-000001
   */
  async generateSaleNumber(tx: MySqlTransaction<any, any, any, any>) {
    // Busca a sequência atual ou cria se não existir
    let sequence = await tx.select().from(saleSequence).limit(1).for('update');
    
    if (sequence.length === 0) {
      await tx.insert(saleSequence).values({ currentNumber: 1, prefix: 'VEN-' });
      sequence = await tx.select().from(saleSequence).limit(1);
    }

    const nextNumber = sequence[0].currentNumber + 1;
    const saleNumber = `${sequence[0].prefix}${nextNumber.toString().padStart(6, '0')}`;

    // Atualiza para o próximo
    await tx.update(saleSequence).set({ currentNumber: nextNumber }).where(eq(saleSequence.id, sequence[0].id));

    return saleNumber;
  }

  async createSale(tx: MySqlTransaction<any, any, any, any>, data: any) {
    const id = uuidv4();
    const saleNumber = await this.generateSaleNumber(tx);
    
    await tx.insert(sales).values({
      ...data,
      id,
      saleNumber,
    });

    return { id, saleNumber };
  }

  async createSaleItems(tx: MySqlTransaction<any, any, any, any>, items: any[]) {
    const itemsWithIds = items.map(item => ({
      ...item,
      id: uuidv4(),
    }));

    await tx.insert(saleItems).values(itemsWithIds);
  }

  async createInstallments(tx: MySqlTransaction<any, any, any, any>, data: any[]) {
    const installmentsWithIds = data.map(inst => ({
      ...inst,
      id: uuidv4(),
    }));

    await tx.insert(installments).values(installmentsWithIds);
  }

  async findById(id: string) {
    const saleRows = await db
      .select({
        id: sales.id,
        saleNumber: sales.saleNumber,
        customerId: sales.customerId,
        userId: sales.userId,
        sellerId: sales.sellerId,
        paymentMethod: sales.paymentMethod,
        totalAmount: sales.totalAmount,
        saleDate: sales.saleDate,
        installmentsCount: sales.installmentsCount,
        isImported: sales.isImported,
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        deletedAt: sales.deletedAt,
        customerName: customers.name,
        sellerName: sellers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(sellers, eq(sales.sellerId, sellers.id))
      .where(and(eq(sales.id, id), isNull(sales.deletedAt)))
      .limit(1);

    if (saleRows.length === 0) return null;

    const items = await db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        productId: saleItems.productId,
        productName: products.name,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        totalPrice: saleItems.totalPrice,
      })
      .from(saleItems)
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, id));

    const insts = await db
      .select()
      .from(installments)
      .where(and(eq(installments.saleId, id), isNull(installments.deletedAt)))
      .orderBy(installments.installmentNumber);

    return {
      ...saleRows[0],
      items,
      installments: insts,
    };
  }

  async list(page: number, limit: number) {
    const offset = (page - 1) * limit;
    
    const data = await db
      .select()
      .from(sales)
      .where(isNull(sales.deletedAt))
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${sales.createdAt} DESC`);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(sales)
      .where(isNull(sales.deletedAt));

    return {
      data,
      total: countResult[0].count,
      page,
      limit,
    };
  }

  async listWithFilters(filters: any) {
    const { page = 1, limit = 10, customerId, paymentMethod, startDate, endDate, search, origin, sellerId } = filters;
    const offset = (page - 1) * limit;

    const onlyRenegotiations = origin === 'renegotiation';
    const onlySales = !!paymentMethod || !!sellerId || origin === 'sales' || origin === 'imported';

    // Build WHERE for sales
    let sCond = sql`s.deleted_at IS NULL AND c.deleted_at IS NULL`;
    if (customerId) sCond = sql`${sCond} AND s.customer_id = ${customerId}`;
    if (paymentMethod) sCond = sql`${sCond} AND s.payment_method = ${paymentMethod}`;
    if (startDate) sCond = sql`${sCond} AND DATE(s.sale_date) >= ${startDate}`;
    if (endDate) sCond = sql`${sCond} AND DATE(s.sale_date) <= ${endDate}`;
    if (search) {
      const term = `%${search}%`;
      sCond = sql`${sCond} AND (LOWER(s.sale_number) LIKE LOWER(${term}) OR LOWER(c.name) LIKE LOWER(${term}))`;
    }
    if (sellerId) sCond = sql`${sCond} AND s.seller_id = ${sellerId}`;
    if (origin === 'sales') sCond = sql`${sCond} AND s.sale_number LIKE 'VEN-%'`;
    else if (origin === 'imported') sCond = sql`${sCond} AND s.sale_number LIKE 'IMP-%'`;

    // Build WHERE for renegotiations
    let rCond = sql`c.deleted_at IS NULL`;
    if (customerId) rCond = sql`${rCond} AND r.customer_id = ${customerId}`;
    if (startDate) rCond = sql`${rCond} AND DATE(r.created_at) >= ${startDate}`;
    if (endDate) rCond = sql`${rCond} AND DATE(r.created_at) <= ${endDate}`;
    if (search) {
      const term = `%${search}%`;
      rCond = sql`${rCond} AND (LOWER(r.ren_number) LIKE LOWER(${term}) OR LOWER(c.name) LIKE LOWER(${term}))`;
    }

    const mapRow = (row: any) => ({
      id: row.id,
      saleNumber: row.saleNumber,
      customerId: row.customerId,
      userId: row.userId,
      paymentMethod: row.paymentMethod,
      totalAmount: parseFloat(row.totalAmount?.toString() ?? '0'),
      saleDate: row.saleDate,
      installmentsCount: row.installmentsCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      customerName: row.customerName,
      recordType: (row.recordType as string) ?? 'sale',
      isRenegotiated: Boolean(Number(row.isRenegotiated)),
      originalAmount: row.originalAmount != null ? parseFloat(row.originalAmount.toString()) : undefined,
      discount: row.discount != null ? parseFloat(row.discount.toString()) : undefined,
      sellerName: row.sellerName ?? null,
      sellerId: row.sellerId ?? null,
      status: row.deletedAt ? 'canceled' : 'completed',
    });

    if (onlyRenegotiations) {
      const [[rows], [countRows]] = await Promise.all([
        db.execute(sql`
          SELECT r.id, r.ren_number AS saleNumber, r.customer_id AS customerId,
            r.created_by AS userId, 'renegotiation' AS paymentMethod,
            r.new_amount AS totalAmount, r.created_at AS saleDate,
            r.installments_count AS installmentsCount,
            r.created_at AS createdAt, r.created_at AS updatedAt,
            NULL AS deletedAt, c.name AS customerName,
            'renegotiation' AS recordType, 0 AS isRenegotiated,
            r.original_amount AS originalAmount, r.discount AS discount,
            NULL AS sellerName, NULL AS sellerId
          FROM renegotiations r
          LEFT JOIN customers c ON r.customer_id = c.id
          WHERE ${rCond}
          ORDER BY r.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) AS count FROM renegotiations r
          LEFT JOIN customers c ON r.customer_id = c.id
          WHERE ${rCond}
        `),
      ]);
      return { data: (rows as any[]).map(mapRow), total: Number((countRows as any[])[0]?.count ?? 0), page, limit };
    }

    if (onlySales) {
      const [[rows], [countRows]] = await Promise.all([
        db.execute(sql`
          SELECT s.id, s.sale_number AS saleNumber, s.customer_id AS customerId,
            s.user_id AS userId, s.payment_method AS paymentMethod,
            s.total_amount AS totalAmount, s.sale_date AS saleDate,
            s.installments_count AS installmentsCount,
            s.created_at AS createdAt, s.updated_at AS updatedAt,
            s.deleted_at AS deletedAt, c.name AS customerName,
            'sale' AS recordType,
            CAST(EXISTS(SELECT 1 FROM installments i WHERE i.sale_id = s.id AND i.renegotiation_id IS NOT NULL AND i.deleted_at IS NOT NULL) AS UNSIGNED) AS isRenegotiated,
            NULL AS originalAmount, NULL AS discount,
            sel.name AS sellerName, s.seller_id AS sellerId
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          LEFT JOIN sellers sel ON s.seller_id = sel.id
          WHERE ${sCond}
          ORDER BY s.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) AS count FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE ${sCond}
        `),
      ]);
      return { data: (rows as any[]).map(mapRow), total: Number((countRows as any[])[0]?.count ?? 0), page, limit };
    }

    // UNION ALL: sales + renegotiations
    const [[rows], [countRows]] = await Promise.all([
      db.execute(sql`
        SELECT * FROM (
          SELECT s.id, s.sale_number AS saleNumber, s.customer_id AS customerId,
            s.user_id AS userId, s.payment_method AS paymentMethod,
            s.total_amount AS totalAmount, s.sale_date AS saleDate,
            s.installments_count AS installmentsCount,
            s.created_at AS createdAt, s.updated_at AS updatedAt,
            s.deleted_at AS deletedAt, c.name AS customerName,
            'sale' AS recordType,
            CAST(EXISTS(SELECT 1 FROM installments i WHERE i.sale_id = s.id AND i.renegotiation_id IS NOT NULL AND i.deleted_at IS NOT NULL) AS UNSIGNED) AS isRenegotiated,
            NULL AS originalAmount, NULL AS discount,
            sel.name AS sellerName, s.seller_id AS sellerId
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          LEFT JOIN sellers sel ON s.seller_id = sel.id
          WHERE ${sCond}
          UNION ALL
          SELECT r.id, r.ren_number AS saleNumber, r.customer_id AS customerId,
            r.created_by AS userId, 'renegotiation' AS paymentMethod,
            r.new_amount AS totalAmount, r.created_at AS saleDate,
            r.installments_count AS installmentsCount,
            r.created_at AS createdAt, r.created_at AS updatedAt,
            NULL AS deletedAt, c.name AS customerName,
            'renegotiation' AS recordType, 0 AS isRenegotiated,
            r.original_amount AS originalAmount, r.discount AS discount,
            NULL AS sellerName, NULL AS sellerId
          FROM renegotiations r
          LEFT JOIN customers c ON r.customer_id = c.id
          WHERE ${rCond}
        ) AS combined
        ORDER BY createdAt DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS count FROM (
          SELECT s.id FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE ${sCond}
          UNION ALL
          SELECT r.id FROM renegotiations r
          LEFT JOIN customers c ON r.customer_id = c.id
          WHERE ${rCond}
        ) AS combined
      `),
    ]);
    return { data: (rows as any[]).map(mapRow), total: Number((countRows as any[])[0]?.count ?? 0), page, limit };
  }

  async softDelete(tx: MySqlTransaction<any, any, any, any>, saleId: string) {
    await tx.update(sales).set({ deletedAt: new Date() }).where(eq(sales.id, saleId));
  }

  async softDeleteInstallmentsBySaleId(tx: MySqlTransaction<any, any, any, any>, saleId: string) {
    await tx
      .update(installments)
      .set({ status: 'canceled', deletedAt: new Date() })
      .where(and(eq(installments.saleId, saleId), isNull(installments.deletedAt)));
  }

  async updateInstallmentStatus(tx: MySqlTransaction<any, any, any, any>, installmentId: string, status: string) {
    await tx.update(installments).set({ status }).where(eq(installments.id, installmentId));
  }

  async getTotalSales() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const result = await db
      .select({ total: sql<number>`sum(${sales.totalAmount})` })
      .from(sales)
      .where(
        and(
          isNull(sales.deletedAt),
          ne(sales.isImported, true),
          sql`${sales.saleDate} >= ${startOfMonth}`,
          sql`${sales.saleDate} <= ${endOfMonth}`
        )
      );

    return parseFloat(String(result[0].total)) || 0;
  }

  async getTopProductsThisMonth() {
    const result = await db.execute(sql`
      SELECT
        p.name,
        p.sku,
        SUM(si.quantity) as total_qty,
        SUM(si.total_price) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.deleted_at IS NULL
        AND s.is_imported = 0
        AND YEAR(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
        AND MONTH(CONVERT_TZ(s.sale_date, '+00:00', '-03:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_qty DESC
      LIMIT 5
    `);
    return (result[0] as any[]).map(row => ({
      name: row.name,
      sku: row.sku ?? '',
      totalQty: Number(row.total_qty) || 0,
      totalRevenue: parseFloat(row.total_revenue?.toString() ?? '0') || 0,
    }));
  }

  async getSalesLast7Days() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const result = await db
      .select({
        saleDate: sql<string>`DATE(${sales.saleDate})`,
        totalSales: sql<number>`sum(${sales.totalAmount})`,
      })
      .from(sales)
      .where(and(isNull(sales.deletedAt), sql`${sales.saleDate} >= ${sevenDaysAgo}`))
      .groupBy(sql`DATE(${sales.saleDate})`)
      .orderBy(sql`DATE(${sales.saleDate}) ASC`);

    return result.map(row => ({
      saleDate: row.saleDate,
      totalSales: parseFloat(String(row.totalSales)) || 0,
    }));
  }
}
