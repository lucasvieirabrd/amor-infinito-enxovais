import { Request, Response } from 'express';
import { NfImportService } from '../services/nf-import.service';
import { z } from 'zod';

const nfImportService = new NfImportService();

export class NfImportController {
  async parse(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo PDF não enviado' });
    }
    const result = await nfImportService.parse(req.file.buffer);
    return res.json(result);
  }

  async confirm(req: Request, res: Response) {
    const itemSchema = z.object({
      supplierCode: z.string(),
      supplierDescription: z.string(),
      ncm: z.string(),
      quantity: z.number().positive(),
      unitCost: z.number().nonnegative(),
      totalCost: z.number().nonnegative(),
      action: z.enum(['link', 'new', 'ignore']),
      productId: z.string().nullable(),
      newProductName: z.string().nullable(),
    });

    const bodySchema = z.object({
      filename: z.string(),
      accessKey: z.string().nullable(),
      nfNumber: z.string().nullable(),
      nfSeries: z.string().nullable(),
      supplierCnpj: z.string().nullable(),
      supplierName: z.string().nullable(),
      nfDate: z.string().nullable(),
      totalProducts: z.number().nullable(),
      reimport: z.boolean().default(false),
      items: z.array(itemSchema).min(1),
    });

    const data = bodySchema.parse(req.body);
    const result = await nfImportService.confirm({
      ...data,
      importedBy: (req as any).user.id,
    });
    return res.json(result);
  }

  async list(req: Request, res: Response) {
    const schema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 20),
    });
    const { page, limit } = schema.parse(req.query);
    const result = await nfImportService.list(page, limit);
    return res.json(result);
  }
}
