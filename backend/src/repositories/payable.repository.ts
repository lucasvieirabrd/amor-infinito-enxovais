import { db } from '../database';
import { payables, payableRecurrences } from '../database/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class PayableRepository {
  async findAllPayables(month: number, year: number, search?: string, category?: string) {
    const searchCond = search
      ? sql`AND p.description LIKE ${'%' + search + '%'}`
      : sql``;
    const catCond = category ? sql`AND p.category = ${category}` : sql``;

    const rows = await db.execute(sql`
      SELECT
        p.id, p.recurrence_id, p.description, p.category,
        p.amount, p.due_date, p.status, p.paid_at, p.paid_amount, p.notes, p.created_by,
        p.created_at, p.updated_at,
        CASE
          WHEN p.status = 'paid' THEN 'paid'
          WHEN p.status = 'pending'
            AND DATE(CONVERT_TZ(p.due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN 'overdue'
          ELSE 'pending'
        END AS computed_status
      FROM payables p
      WHERE p.deleted_at IS NULL
        AND MONTH(CONVERT_TZ(p.due_date, '+00:00', '-03:00')) = ${month}
        AND YEAR(CONVERT_TZ(p.due_date, '+00:00', '-03:00')) = ${year}
        ${searchCond}
        ${catCond}
      ORDER BY p.due_date ASC
    `);

    return (rows[0] as unknown as any[]).map(r => this._mapRow(r));
  }

  async findPayableById(id: string) {
    const result = await db
      .select()
      .from(payables)
      .where(and(eq(payables.id, id), isNull(payables.deletedAt)))
      .limit(1);
    return result[0];
  }

  async createPayable(data: {
    recurrenceId?: string;
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number;
    dueDate: Date;
    notes?: string;
    createdBy?: string;
  }) {
    const id = uuidv4();
    await db.insert(payables).values({
      id,
      recurrenceId: data.recurrenceId ?? null,
      description: data.description,
      category: data.category,
      amount: data.amount != null ? String(data.amount.toFixed(2)) : null,
      dueDate: data.dueDate,
      notes: data.notes ?? null,
      createdBy: data.createdBy ?? null,
    });
    return this.findPayableById(id);
  }

  async updatePayable(id: string, data: Partial<{
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount: number | null;
    dueDate: Date;
    notes: string | null;
  }>) {
    const update: any = { updatedAt: new Date() };
    if (data.description !== undefined) update.description = data.description;
    if (data.category !== undefined) update.category = data.category;
    if ('amount' in data) update.amount = data.amount != null ? String(data.amount.toFixed(2)) : null;
    if (data.dueDate !== undefined) update.dueDate = data.dueDate;
    if ('notes' in data) update.notes = data.notes;

    await db.update(payables).set(update).where(eq(payables.id, id));
    return this.findPayableById(id);
  }

  async markAsPaid(id: string, paidAmount: number, paidAt: Date) {
    await db.update(payables).set({
      status: 'paid',
      paidAmount: String(paidAmount.toFixed(2)),
      paidAt,
      updatedAt: new Date(),
    }).where(eq(payables.id, id));
    return this.findPayableById(id);
  }

  async revertPayment(id: string) {
    await db.update(payables).set({
      status: 'pending',
      paidAmount: null,
      paidAt: null,
      updatedAt: new Date(),
    }).where(eq(payables.id, id));
    return this.findPayableById(id);
  }

  async softDeletePayable(id: string) {
    await db.update(payables).set({ deletedAt: new Date() }).where(eq(payables.id, id));
  }

  async existsPayableForRecurrenceInMonth(recurrenceId: string, month: number, year: number) {
    const rows = await db.execute(sql`
      SELECT id FROM payables
      WHERE recurrence_id = ${recurrenceId}
        AND deleted_at IS NULL
        AND MONTH(CONVERT_TZ(due_date, '+00:00', '-03:00')) = ${month}
        AND YEAR(CONVERT_TZ(due_date, '+00:00', '-03:00')) = ${year}
      LIMIT 1
    `);
    return (rows[0] as unknown as any[]).length > 0;
  }

  async getSummary(month: number, year: number) {
    const rows = await db.execute(sql`
      SELECT
        SUM(CASE WHEN status = 'pending'
          AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) >= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN COALESCE(amount, 0) ELSE 0 END) AS pending_amount,
        COUNT(CASE WHEN status = 'pending'
          AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN 1 END) AS overdue_count,
        SUM(CASE WHEN status = 'pending'
          AND DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN COALESCE(amount, 0) ELSE 0 END) AS overdue_amount,
        COUNT(CASE WHEN status = 'pending'
          AND DATEDIFF(DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')), DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))) BETWEEN 0 AND 3
          THEN 1 END) AS due_soon_count,
        SUM(CASE WHEN status = 'paid'
          AND MONTH(CONVERT_TZ(paid_at, '+00:00', '-03:00')) = ${month}
          AND YEAR(CONVERT_TZ(paid_at, '+00:00', '-03:00')) = ${year}
          THEN COALESCE(paid_amount, 0) ELSE 0 END) AS paid_this_month
      FROM payables
      WHERE deleted_at IS NULL
        AND MONTH(CONVERT_TZ(due_date, '+00:00', '-03:00')) = ${month}
        AND YEAR(CONVERT_TZ(due_date, '+00:00', '-03:00')) = ${year}
    `);
    const r = (rows[0] as unknown as any[])[0] ?? {};
    return {
      pendingAmount: parseFloat(r.pending_amount ?? '0') || 0,
      overdueCount: Number(r.overdue_count ?? 0),
      overdueAmount: parseFloat(r.overdue_amount ?? '0') || 0,
      dueSoonCount: Number(r.due_soon_count ?? 0),
      paidThisMonth: parseFloat(r.paid_this_month ?? '0') || 0,
    };
  }

  async findPendingOrSoonPayables() {
    const rows = await db.execute(sql`
      SELECT description, amount, due_date,
        CASE
          WHEN DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          THEN 'overdue'
          ELSE 'soon'
        END AS urgency
      FROM payables
      WHERE deleted_at IS NULL
        AND status = 'pending'
        AND DATEDIFF(DATE(CONVERT_TZ(due_date, '+00:00', '-03:00')), DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))) <= 3
      ORDER BY due_date ASC
    `);
    return (rows[0] as unknown as any[]).map(r => ({
      description: r.description,
      amount: r.amount != null ? parseFloat(r.amount) : null,
      dueDate: r.due_date,
      urgency: r.urgency,
    }));
  }

  // ─── Recurrences ────────────────────────────────────────────────────────────

  async findAllRecurrences(includeInactive = false) {
    const conditions: any[] = [isNull(payableRecurrences.deletedAt)];
    if (!includeInactive) conditions.push(eq(payableRecurrences.active, true));
    return db.select().from(payableRecurrences).where(and(...conditions)).orderBy(payableRecurrences.description);
  }

  async findRecurrenceById(id: string) {
    const result = await db
      .select()
      .from(payableRecurrences)
      .where(and(eq(payableRecurrences.id, id), isNull(payableRecurrences.deletedAt)))
      .limit(1);
    return result[0];
  }

  async createRecurrence(data: {
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number;
    isVariable: boolean;
    dueDay: number;
    notes?: string;
  }) {
    const id = uuidv4();
    await db.insert(payableRecurrences).values({
      id,
      description: data.description,
      category: data.category,
      amount: data.amount != null ? String(data.amount.toFixed(2)) : null,
      isVariable: data.isVariable,
      dueDay: data.dueDay,
      notes: data.notes ?? null,
    });
    return this.findRecurrenceById(id);
  }

  async updateRecurrence(id: string, data: Partial<{
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount: number | null;
    isVariable: boolean;
    dueDay: number;
    active: boolean;
    notes: string | null;
  }>) {
    const update: any = { updatedAt: new Date() };
    if (data.description !== undefined) update.description = data.description;
    if (data.category !== undefined) update.category = data.category;
    if ('amount' in data) update.amount = data.amount != null ? String(data.amount.toFixed(2)) : null;
    if (data.isVariable !== undefined) update.isVariable = data.isVariable;
    if (data.dueDay !== undefined) update.dueDay = data.dueDay;
    if (data.active !== undefined) update.active = data.active;
    if ('notes' in data) update.notes = data.notes;

    await db.update(payableRecurrences).set(update).where(eq(payableRecurrences.id, id));
    return this.findRecurrenceById(id);
  }

  async softDeleteRecurrence(id: string) {
    await db.update(payableRecurrences).set({ deletedAt: new Date(), active: false }).where(eq(payableRecurrences.id, id));
  }

  private _mapRow(r: any) {
    return {
      id: String(r.id),
      recurrenceId: r.recurrence_id ? String(r.recurrence_id) : null,
      description: String(r.description),
      category: String(r.category),
      amount: r.amount != null ? parseFloat(r.amount) : null,
      dueDate: r.due_date,
      status: String(r.computed_status),
      paidAt: r.paid_at ?? null,
      paidAmount: r.paid_amount != null ? parseFloat(r.paid_amount) : null,
      notes: r.notes ?? null,
      createdBy: r.created_by ?? null,
      createdAt: r.created_at,
    };
  }
}
