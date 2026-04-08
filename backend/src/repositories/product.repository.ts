import { db } from '../database';
import { products } from '../database/schema';
import { eq, and, isNull, or, like, sql } from 'drizzle-orm';
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

  async list(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    
    let query = db
      .select()
      .from(products)
      .where(isNull(products.deletedAt));

    if (search) {
      query = db
        .select()
        .from(products)
        .where(
          and(
            isNull(products.deletedAt),
            or(
              like(products.name, `%${search}%`),
              like(products.sku, `%${search}%`)
            )
          )
        );
    }

    const data = await query.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(
        search 
          ? and(
              isNull(products.deletedAt),
              or(
                like(products.name, `%${search}%`),
                like(products.sku, `%${search}%`)
              )
            )
          : isNull(products.deletedAt)
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
