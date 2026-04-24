import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { z } from 'zod';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const dashboardService = new DashboardService();

export class DashboardController {
  async getSalesMetrics(req: Request, res: Response) {
    const schema = z.object({
      start:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      end:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      compareTo: z.enum(['previous', 'year_ago', 'none']).optional().default('none'),
    });

    const { start, end, compareTo } = schema.parse(req.query);

    // process.env.TZ = 'America/Sao_Paulo' garante que new Date() usa fuso correto
    const now = new Date();
    const startDate = start ?? format(startOfMonth(now), 'yyyy-MM-dd');
    const endDate   = end   ?? format(endOfMonth(now),   'yyyy-MM-dd');

    const metrics = await dashboardService.getSalesMetrics({
      start: startDate,
      end:   endDate,
      compareTo,
    });

    return res.json(metrics);
  }
}
