import { Request, Response } from 'express';
import { z } from 'zod';
import { DeliveryScheduleService } from '../services/delivery-schedule.service';
import { AppError } from '../utils/AppError';

const service = new DeliveryScheduleService();

// Today in SP (UTC-3) without toLocaleString
function todaySP(): string {
  const now = new Date();
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = sp.getUTCFullYear();
  const m = String(sp.getUTCMonth() + 1).padStart(2, '0');
  const d = String(sp.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export class DeliveryScheduleController {
  /** GET /api/delivery-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD — admin */
  async getSchedule(req: Request, res: Response) {
    const today = todaySP();
    const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
      ? req.query.from : today;
    const to   = typeof req.query.to   === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
      ? req.query.to : addDays(from, 6);

    const slots = await service.getScheduleRange(from, to);
    res.json(slots);
  }

  /** POST /api/delivery-schedule/:id/release — admin */
  async releaseSlot(req: Request, res: Response) {
    const { id } = req.params;
    if (!id) throw new AppError('ID não informado', 400);
    const userId = (req as any).user?.id ?? 'unknown';
    await service.releaseSlot(id, userId);
    res.json({ ok: true });
  }
}
