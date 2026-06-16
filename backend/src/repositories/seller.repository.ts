import { db } from '../database';
import { sellers } from '../database/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class SellerRepository {
  async list() {
    return db.select().from(sellers).where(isNull(sellers.deletedAt)).orderBy(sellers.name);
  }

  async listActive() {
    return db
      .select()
      .from(sellers)
      .where(and(isNull(sellers.deletedAt), eq(sellers.active, true)))
      .orderBy(sellers.name);
  }

  async findById(id: string) {
    const rows = await db.select().from(sellers).where(eq(sellers.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(name: string) {
    const id = uuidv4();
    await db.insert(sellers).values({ id, name });
    return { id, name };
  }

  async update(id: string, data: { name?: string; active?: boolean }) {
    await db.update(sellers).set(data).where(eq(sellers.id, id));
  }

  async softDelete(id: string) {
    await db.update(sellers).set({ deletedAt: new Date(), active: false }).where(eq(sellers.id, id));
  }
}
