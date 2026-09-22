import { db } from '../database';
import { holidays } from '../database/schema';
import { eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class HolidayRepository {
  async findAll(year?: number) {
    if (year) {
      const rows = await db.execute(sql`
        SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, description, created_at, updated_at
        FROM holidays
        WHERE deleted_at IS NULL AND YEAR(date) = ${year}
        ORDER BY date ASC
      `);
      return ((rows as any)[0] as any[]).map(this._map);
    }
    const rows = await db.execute(sql`
      SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, description, created_at, updated_at
      FROM holidays
      WHERE deleted_at IS NULL
      ORDER BY date ASC
    `);
    return ((rows as any)[0] as any[]).map(this._map);
  }

  async findById(id: string) {
    const rows = await db.execute(sql`
      SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, description, created_at, updated_at
      FROM holidays WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `);
    const row = ((rows as any)[0] as any[])[0];
    return row ? this._map(row) : null;
  }

  async findByDate(dateStr: string) {
    const rows = await db.execute(sql`
      SELECT id FROM holidays WHERE date = ${dateStr} AND deleted_at IS NULL LIMIT 1
    `);
    return ((rows as any)[0] as any[])[0] ?? null;
  }

  async create(dateStr: string, description: string) {
    const id = uuidv4();
    await db.execute(sql`
      INSERT INTO holidays (id, date, description) VALUES (${id}, ${dateStr}, ${description})
    `);
    return this.findById(id);
  }

  async update(id: string, data: { date?: string; description?: string }) {
    const sets: any = { updatedAt: new Date() };
    if (data.description !== undefined) sets.description = data.description;
    if (data.date !== undefined) sets.date = new Date(data.date + 'T12:00:00Z');
    await db.update(holidays).set(sets).where(eq(holidays.id, id));
    return this.findById(id);
  }

  async softDelete(id: string) {
    await db.update(holidays).set({ deletedAt: new Date() }).where(eq(holidays.id, id));
  }

  private _map(r: any) {
    return {
      id:          String(r.id),
      date:        String(r.date),
      description: String(r.description),
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    };
  }
}
