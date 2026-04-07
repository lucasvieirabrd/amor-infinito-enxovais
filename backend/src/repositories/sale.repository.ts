import { db } from '../database';
import { sales, saleItems, installments, saleSequence } from '../database/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
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
    const sale = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), isNull(sales.deletedAt)))
      .limit(1);
    
    if (sale.length === 0) return null;

    const items = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, id));

    const insts = await db
      .select()
      .from(installments)
      .where(and(eq(installments.saleId, id), isNull(installments.deletedAt)));

    return {
      ...sale[0],
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
}
