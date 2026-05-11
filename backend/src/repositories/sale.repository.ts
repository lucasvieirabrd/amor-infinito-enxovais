import { db } from '../database';
import { sales, saleItems, installments, saleSequence, customers, products } from '../database/schema';
import { eq, and, isNull, sql, ne, or, like } from 'drizzle-orm';
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
        paymentMethod: sales.paymentMethod,
        totalAmount: sales.totalAmount,
        saleDate: sales.saleDate,
        installmentsCount: sales.installmentsCount,
        isImported: sales.isImported,
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        deletedAt: sales.deletedAt,
        customerName: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
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
    const { page = 1, limit = 10, customerId, paymentMethod, startDate, endDate, search, origin } = filters;
    const offset = (page - 1) * limit;

    const conditions: any[] = [isNull(sales.deletedAt), isNull(customers.deletedAt)];

    if (customerId) {
      conditions.push(eq(sales.customerId, customerId));
    }

    if (paymentMethod) {
      conditions.push(eq(sales.paymentMethod, paymentMethod));
    }

    if (startDate) {
      conditions.push(sql`${sales.saleDate} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${sales.saleDate} <= ${endDate}`);
    }

    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          sql`LOWER(${sales.saleNumber}) LIKE LOWER(${term})`,
          sql`LOWER(${customers.name}) LIKE LOWER(${term})`
        )
      );
    }

    if (origin === 'sales') {
      conditions.push(sql`${sales.saleNumber} LIKE 'VEN-%'`);
    } else if (origin === 'imported') {
      conditions.push(sql`${sales.saleNumber} LIKE 'IMP-%'`);
    }

    const whereClause = and(...conditions);

    const data = await db
      .select({
        id: sales.id,
        saleNumber: sales.saleNumber,
        customerId: sales.customerId,
        userId: sales.userId,
        paymentMethod: sales.paymentMethod,
        totalAmount: sales.totalAmount,
        saleDate: sales.saleDate,
        installmentsCount: sales.installmentsCount,
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        deletedAt: sales.deletedAt,
        customerName: sql`${customers.name}`,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${sales.createdAt} DESC`);

    const mappedData = data.map((row: any) => ({
      ...row,
      status: row.deletedAt ? 'canceled' : 'completed',
    }));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(whereClause);

    return {
      data: mappedData,
      total: countResult[0].count,
      page,
      limit,
    };
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
