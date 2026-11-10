import { db } from '../database';
import { settings } from '../database/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/AppError';
import { PricingParams, DEFAULT_PARAMS } from '../utils/pricingFormulas';

const PARAMS_KEY = 'pricing_params';
const CODE_KEY = 'pricing_access_code';

export class PricingService {
  async validateCode(code: string): Promise<boolean> {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, CODE_KEY))
      .limit(1);
    if (!rows.length) return false;
    return rows[0].value === code.toUpperCase().trim();
  }

  async getParams(): Promise<PricingParams> {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, PARAMS_KEY))
      .limit(1);
    if (!rows.length) return DEFAULT_PARAMS;
    try {
      return { ...DEFAULT_PARAMS, ...JSON.parse(rows[0].value) };
    } catch {
      return DEFAULT_PARAMS;
    }
  }

  async updateParams(params: Partial<PricingParams>): Promise<void> {
    const current = await this.getParams();
    const merged = { ...current, ...params };
    const value = JSON.stringify(merged);

    const existing = await db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, PARAMS_KEY))
      .limit(1);

    if (existing.length) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, PARAMS_KEY));
    } else {
      await db.insert(settings).values({ id: uuidv4(), key: PARAMS_KEY, value, description: 'Parâmetros de precificação' });
    }
  }

  async updateAccessCode(code: string): Promise<void> {
    const clean = code.toUpperCase().trim();
    if (clean.length < 4) throw new AppError('Código deve ter no mínimo 4 caracteres', 400);

    const existing = await db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, CODE_KEY))
      .limit(1);

    if (existing.length) {
      await db
        .update(settings)
        .set({ value: clean, updatedAt: new Date() })
        .where(eq(settings.key, CODE_KEY));
    } else {
      await db.insert(settings).values({ id: uuidv4(), key: CODE_KEY, value: clean, description: 'Código de acesso à calculadora' });
    }
  }

  async saveHistory(data: {
    code: string;
    supplier?: string;
    nfNumber?: string;
    totalProducts?: number;
    totalNf?: number;
    freight?: number;
    factor: number;
    paramsSnapshot: PricingParams;
    items: Array<{
      name: string;
      unitCost: number;
      assembly: number;
      installmentsCount: number;
      realCost: number;
      priceCredit: number;
      priceCash: number;
      priceCard1x: number;
      priceCard10x: number;
      profitCredit?: number;
      profitCash?: number;
    }>;
  }): Promise<string> {
    const valid = await this.validateCode(data.code);
    if (!valid) throw new AppError('Código inválido', 401);

    const historyId = uuidv4();

    await db.execute(sql`
      INSERT INTO pricing_history (id, supplier, nf_number, total_products, total_nf, freight, factor, params_snapshot)
      VALUES (
        ${historyId},
        ${data.supplier ?? null},
        ${data.nfNumber ?? null},
        ${data.totalProducts ?? null},
        ${data.totalNf ?? null},
        ${data.freight ?? 0},
        ${data.factor},
        ${JSON.stringify(data.paramsSnapshot)}
      )
    `);

    for (const item of data.items) {
      await db.execute(sql`
        INSERT INTO pricing_history_items
          (id, history_id, name, unit_cost, assembly, installments_count, real_cost, price_credit, price_cash, price_card_1x, price_card_10x, profit_credit, profit_cash)
        VALUES (
          ${uuidv4()}, ${historyId}, ${item.name}, ${item.unitCost}, ${item.assembly},
          ${item.installmentsCount}, ${item.realCost}, ${item.priceCredit}, ${item.priceCash},
          ${item.priceCard1x}, ${item.priceCard10x},
          ${item.profitCredit ?? null}, ${item.profitCash ?? null}
        )
      `);
    }

    return historyId;
  }

  async getHistory(opts: { search?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { search, from, to, limit = 30, offset = 0 } = opts;

    const [rows] = await db.execute(sql`
      SELECT
        h.id, h.supplier, h.nf_number, h.factor,
        h.total_products, h.total_nf, h.freight,
        DATE_FORMAT(CONVERT_TZ(h.created_at, '+00:00', '-03:00'), '%d/%m/%Y %H:%i') AS created_at_sp,
        COUNT(i.id) AS item_count
      FROM pricing_history h
      LEFT JOIN pricing_history_items i ON i.history_id = h.id
      WHERE 1=1
        ${search ? sql`AND (h.supplier LIKE ${`%${search}%`} OR h.nf_number LIKE ${`%${search}%`} OR EXISTS (SELECT 1 FROM pricing_history_items pi WHERE pi.history_id = h.id AND pi.name LIKE ${`%${search}%`}))` : sql``}
        ${from ? sql`AND DATE(CONVERT_TZ(h.created_at, '+00:00', '-03:00')) >= ${from}` : sql``}
        ${to ? sql`AND DATE(CONVERT_TZ(h.created_at, '+00:00', '-03:00')) <= ${to}` : sql``}
      GROUP BY h.id
      ORDER BY h.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as [any[], any];

    return rows as any[];
  }

  async getHistoryDetail(id: string) {
    const [rows] = await db.execute(sql`
      SELECT
        h.id, h.supplier, h.nf_number, h.factor, h.params_snapshot,
        h.total_products, h.total_nf, h.freight,
        DATE_FORMAT(CONVERT_TZ(h.created_at, '+00:00', '-03:00'), '%d/%m/%Y %H:%i') AS created_at_sp
      FROM pricing_history h WHERE h.id = ${id} LIMIT 1
    `) as unknown as [any[], any];

    if (!(rows as any[]).length) throw new AppError('Histórico não encontrado', 404);

    const [items] = await db.execute(sql`
      SELECT * FROM pricing_history_items WHERE history_id = ${id} ORDER BY created_at ASC
    `) as unknown as [any[], any];

    return { ...(rows as any[])[0], items };
  }
}
