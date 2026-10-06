import { Request, Response } from 'express';
import { z } from 'zod';
import { ExternalSellerRepository } from '../repositories/external-seller.repository';
import { DeliveryScheduleService } from '../services/delivery-schedule.service';
import { AppError } from '../utils/AppError';
import { db } from '../database';
import { sql } from 'drizzle-orm';

const sellerRepo   = new ExternalSellerRepository();
const scheduleService = new DeliveryScheduleService();

// Helpers — UTC puro, sem toLocaleString com timezone (Railway)
function todaySP(): string {
  const sp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth()+1).padStart(2,'0')}-${String(sp.getUTCDate()).padStart(2,'0')}`;
}
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}
function getDOW(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export class OrderFormController {
  /** GET /api/order-form/seller?code=XXXX — público, valida código */
  async validateSeller(req: Request, res: Response) {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      throw new AppError('Código não informado', 400);
    }
    const seller = await sellerRepo.findByCode(code.toUpperCase());
    if (!seller) throw new AppError('Código inválido ou vendedor inativo', 404);
    res.json({ id: seller.id, name: seller.name, canScheduleSameDay: Boolean(seller.canScheduleSameDay) });
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

  /** GET /api/order-form/booked-slots?date=YYYY-MM-DD&code=XXXX — público, requer código */
  async bookedSlots(req: Request, res: Response) {
    const { code, date } = req.query;
    if (!code || typeof code !== 'string') throw new AppError('Código não informado', 400);
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Data inválida', 400);
    }
    const seller = await sellerRepo.findByCode(code.toUpperCase());
    if (!seller) throw new AppError('Código inválido ou vendedor inativo', 404);

    const times = await scheduleService.getBookedTimes(date);
    res.json(times);
  }

  /** POST /api/order-form/reserve — público, requer código; reserva com lock */
  async reserve(req: Request, res: Response) {
    const schema = z.object({
      code:         z.string().min(1),
      date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time:         z.string().regex(/^\d{2}:\d{2}$/),
      customerName: z.string().min(1).max(255),
      city:         z.string().min(1).max(100),
    });
    const data = schema.parse(req.body);

    const seller = await sellerRepo.findByCode(data.code.toUpperCase());
    if (!seller) throw new AppError('Código inválido ou vendedor inativo', 404);

    // Validação de data no backend — não confiar só no frontend
    const today = todaySP();
    const minDate = seller.canScheduleSameDay ? today : addOneDay(today);
    if (data.date < minDate) {
      throw new AppError(
        seller.canScheduleSameDay
          ? 'Data de entrega não pode ser no passado'
          : 'Data de entrega deve ser a partir de amanhã',
        422,
      );
    }
    if (getDOW(data.date) === 0) throw new AppError('Entrega não disponível aos domingos', 422);
    const holidayCheck = await db.execute(sql`
      SELECT id FROM holidays
      WHERE deleted_at IS NULL AND DATE_FORMAT(date, '%Y-%m-%d') = ${data.date}
      LIMIT 1
    `);
    if (((holidayCheck as any)[0] as any[]).length > 0) {
      throw new AppError('Data de entrega não disponível (feriado)', 422);
    }

    const id = await scheduleService.reserve({
      date:             data.date,
      time:             data.time,
      externalSellerId: seller.id,
      customerName:     data.customerName,
      city:             data.city,
    });
    res.status(201).json({ id });
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
