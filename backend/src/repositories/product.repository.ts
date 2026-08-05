import { db } from '../database';
import { products } from '../database/schema';
import { eq, and, isNull, isNotNull, inArray, or, like, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { MySqlTransaction } from 'drizzle-orm/mysql-core';

export class ProductRepository {
  async findBySku(sku: string) {
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.sku, sku), isNull(products.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);
    return result[0];
  }

  /**
   * Busca um produto com lock pessimista (FOR UPDATE) para garantir integridade durante vendas.
   * Deve ser chamado dentro de uma transação.
   */
  async findByIdForUpdate(tx: MySqlTransaction<any, any, any, any>, id: string) {
    const result = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .for('update');
    return result[0];
  }

  /** Batch load por IDs — inclui soft-deletados (para snapshot de auditoria). */
  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(products).where(inArray(products.id, ids));
  }

  /**
   * Batch load por SKUs — inclui soft-deletados.
   * Usado no upsert do sync para detectar revive-on-reappear sem N+1.
   */
  async findAllBySkus(skus: string[]) {
    if (skus.length === 0) return [];
    return db.select().from(products).where(inArray(products.sku, skus));
  }

  /** Retorna todos os produtos ativos com SKU não vazio — para cálculo dos candidatos a remoção. */
  async findActiveWithSku() {
    return db
      .select({ id: products.id, sku: products.sku, name: products.name, category: products.category, quantity: products.quantity })
      .from(products)
      .where(and(
        isNull(products.deletedAt),
        isNotNull(products.sku),
        sql`TRIM(${products.sku}) != ''`,
      ));
  }

  /** Conta produtos ativos (para trava de sanidade do sync). */
  async countActives(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(isNull(products.deletedAt));
    return Number(result[0].count);
  }

  /** Revive produto soft-deletado (zera deleted_at). */
  async revive(id: string) {
    await db
      .update(products)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(products.id, id));
  }

  /** Soft-delete em lote — uma única query UPDATE com IN. */
  async softDeleteBatch(ids: string[]) {
    if (ids.length === 0) return;
    await db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(inArray(products.id, ids));
  }

  async list(page: number, limit: number, search?: string, category?: string) {
    const offset = (page - 1) * limit;

    const conditions = [isNull(products.deletedAt)];
    if (search) {
      conditions.push(or(
        like(products.name, `%${search}%`),
        like(products.sku, `%${search}%`),
      )!);
    }
    if (category) {
      conditions.push(eq(products.category, category));
    }

    const where = and(...conditions);

    const data = await db.select().from(products).where(where).limit(limit).offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(where);

    const totalPages = Math.ceil(countResult[0].count / limit);

    return {
      data,
      total: countResult[0].count,
      page,
      limit,
      totalPages,
    };
  }

  async listCategories(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(and(isNull(products.deletedAt), sql`${products.category} IS NOT NULL`))
      .orderBy(products.category);
    return rows.map(r => r.category as string);
  }

  async create(data: any) {
    const id = uuidv4();
    await db.insert(products).values({
      ...data,
      id,
    });
    return this.findById(id);
  }

  async update(id: string, data: any) {
    await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id));
    return this.findById(id);
  }

  /**
   * Atualiza o estoque dentro de uma transação.
   */
  async updateStock(tx: MySqlTransaction<any, any, any, any>, id: string, newQuantity: number) {
    await tx
      .update(products)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(products.id, id));
  }

  async delete(id: string) {
    await db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, id));
  }
}
