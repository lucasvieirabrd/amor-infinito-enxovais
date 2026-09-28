import { Request, Response } from 'express';
import { ExternalSellerRepository } from '../repositories/external-seller.repository';
import { AppError } from '../utils/AppError';
import { db } from '../database';
import { sql } from 'drizzle-orm';

const sellerRepo = new ExternalSellerRepository();

export class OrderFormController {
  /** GET /api/order-form/seller?code=XXXX — público, valida código */
  async validateSeller(req: Request, res: Response) {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      throw new AppError('Código não informado', 400);
    }
    const seller = await sellerRepo.findByCode(code.toUpperCase());
    if (!seller) throw new AppError('Código inválido ou vendedor inativo', 404);
    res.json({ id: seller.id, name: seller.name });
  }

  /** GET /api/order-form/products?code=XXXX — público, requer código válido */
  async products(req: Request, res: Response) {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      throw new AppError('Código não informado', 400);
    }
    const seller = await sellerRepo.findByCode(code.toUpperCase());
    if (!seller) throw new AppError('Código inválido ou vendedor inativo', 404);

    const rows = await db.execute(sql`
      SELECT name, price, description
      FROM products
      WHERE deleted_at IS NULL AND quantity > 0
      ORDER BY name ASC
    `);

    const data = ((rows as any)[0] as any[]).map((r: any) => ({
      name:        String(r.name),
      price:       parseFloat(String(r.price)) || 0,
      description: r.description ? String(r.description) : null,
    }));
    res.json(data);
  }

  /**
   * GET /api/order-form/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD — público
   * Retorna datas de feriados no intervalo para o calendário bloquear.
   */
  async holidays(req: Request, res: Response) {
    const { from, to } = req.query;
    const fromDate = typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const toDate   = typeof to   === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;

    let rows;
    if (fromDate && toDate) {
      rows = await db.execute(sql`
        SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, description
        FROM holidays
        WHERE deleted_at IS NULL
          AND date >= ${fromDate}
          AND date <= ${toDate}
        ORDER BY date ASC
      `);
    } else {
      // Default: próximos 12 meses a partir de hoje (SP)
      rows = await db.execute(sql`
        SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, description
        FROM holidays
        WHERE deleted_at IS NULL
          AND date >= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND date <= DATE_ADD(DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')), INTERVAL 12 MONTH)
        ORDER BY date ASC
      `);
    }

    const data = ((rows as any)[0] as any[]).map((r: any) => ({
      date:        String(r.date),
      description: String(r.description),
    }));
    res.json(data);
  }
}
