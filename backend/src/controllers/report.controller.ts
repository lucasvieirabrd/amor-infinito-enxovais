import { Request, Response } from 'express';
import { z } from 'zod';
import { generateCreditReportPdf, generateCreditReportExcel, ReportParams } from '../services/creditReport.service';
import { generateSellerReportPdf, generateSellerReportExcel } from '../services/sellerReport.service';

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

  async getSellerReport(req: Request, res: Response) {
    const schema = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sellerId: z.string().optional(),
      commissionPercent: z.coerce.number().min(0).max(100).default(5),
      format: z.enum(['pdf', 'excel']).default('pdf'),
    });

    const parsed = schema.parse(req.query);
    const dateStr = new Date().toISOString().slice(0, 10);

    const reportParams = {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      sellerId: parsed.sellerId,
      commissionPercent: parsed.commissionPercent,
      outputFormat: parsed.format as 'pdf' | 'excel',
    };

    if (parsed.format === 'pdf') {
      const buffer = await generateSellerReportPdf(reportParams);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-vendedores-${dateStr}.pdf"`);
      return res.send(buffer);
    }

    const buffer = await generateSellerReportExcel(reportParams);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-vendedores-${dateStr}.xlsx"`);
    return res.send(buffer);
  }
}
