import { db } from '../database';
import { externalSellers } from '../database/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class ExternalSellerRepository {
  async findAll() {
    return db
      .select()
      .from(externalSellers)
      .where(isNull(externalSellers.deletedAt))
      .orderBy(externalSellers.name);
  }

  async findById(id: string) {
    const rows = await db
      .select()
      .from(externalSellers)
      .where(and(eq(externalSellers.id, id), isNull(externalSellers.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByCode(code: string) {
    const rows = await db
      .select()
      .from(externalSellers)
      .where(
        and(
          eq(externalSellers.code, code),
          eq(externalSellers.active, true),
          isNull(externalSellers.deletedAt),
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findByCodeAdmin(code: string, excludeId?: string) {
    const rows = await db.execute(sql`
      SELECT id FROM external_sellers
      WHERE code = ${code}
        AND deleted_at IS NULL
        ${excludeId ? sql`AND id != ${excludeId}` : sql``}
      LIMIT 1
    `);
    return ((rows as any)[0] as any[])[0] ?? null;
  }

  async create(name: string, code: string, canScheduleSameDay = false) {
    const id = uuidv4();
    await db.insert(externalSellers).values({ id, name, code, canScheduleSameDay });
    return this.findById(id);
  }

  async update(id: string, data: { name?: string; code?: string; active?: boolean; canScheduleSameDay?: boolean }) {
    await db.update(externalSellers).set({ ...data, updatedAt: new Date() }).where(eq(externalSellers.id, id));
    return this.findById(id);
  }

  async softDelete(id: string) {
    await db
      .update(externalSellers)
      .set({ deletedAt: new Date(), active: false })
      .where(eq(externalSellers.id, id));
  }
}
