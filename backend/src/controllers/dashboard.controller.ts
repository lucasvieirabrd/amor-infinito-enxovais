import { Request, Response } from 'express';
import { DashboardService, generateDashboardReportPdf } from '../services/dashboard.service';
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

  async getReportPdf(req: Request, res: Response) {
    const schema = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });

    const { startDate, endDate } = schema.parse(req.query);
    const now = new Date();
    const sd = startDate ?? format(startOfMonth(now), 'yyyy-MM-dd');
    const ed = endDate   ?? format(endOfMonth(now),   'yyyy-MM-dd');

    const data = await dashboardService.getReportData(sd, ed);
    const pdf  = await generateDashboardReportPdf(data);

    const today = format(new Date(), 'yyyy-MM-dd');
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-dashboard-${today}.pdf"`,
      'Content-Length':      String(pdf.length),
    });
    res.end(pdf);
  }
}
