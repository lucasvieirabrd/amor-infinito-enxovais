import { Request, Response } from 'express';
import { z } from 'zod';
import { generateCreditReportPdf, generateCreditReportExcel, ReportParams } from '../services/creditReport.service';

export class ReportController {
  async getCreditReport(req: Request, res: Response) {
    const schema = z.object({
      status: z.enum(['all', 'overdue', 'today', 'current', 'paid']).default('all'),
      customerId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      format: z.enum(['pdf', 'excel']).default('pdf'),
    });

    const parsed = schema.parse(req.query);

    const reportParams: ReportParams = {
      status: parsed.status,
      customerId: parsed.customerId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      outputFormat: parsed.format,
    };

    const dateStr = new Date().toISOString().slice(0, 10);

    if (parsed.format === 'pdf') {
      const buffer = await generateCreditReportPdf(reportParams);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-crediario-${dateStr}.pdf"`);
      return res.send(buffer);
    }

    const buffer = await generateCreditReportExcel(reportParams);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-crediario-${dateStr}.xlsx"`);
    return res.send(buffer);
  }
}
