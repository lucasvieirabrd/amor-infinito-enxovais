import { Request, Response } from 'express';
import { NfImportService, ConfirmItem } from '../services/nf-import.service';
import { z } from 'zod';

const nfImportService = new NfImportService();

// Schemas at module level so z.infer resolves correctly
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

const confirmBodySchema = z.object({
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

export class NfImportController {
  async parse(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo não enviado' });
    }
    const result = await nfImportService.parse(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json(result);
  }

  async confirm(req: Request, res: Response) {
    const d = confirmBodySchema.parse(req.body);

    // Explicit field mapping ensures types match the service signature
    // regardless of how z.infer resolves optional vs required in this Zod version
    const result = await nfImportService.confirm({
      filename: String(d.filename ?? ''),
      accessKey: d.accessKey ?? null,
      nfNumber: d.nfNumber ?? null,
      nfSeries: d.nfSeries ?? null,
      supplierCnpj: d.supplierCnpj ?? null,
      supplierName: d.supplierName ?? null,
      nfDate: d.nfDate ?? null,
      totalProducts: d.totalProducts ?? null,
      reimport: d.reimport ?? false,
      importedBy: (req as any).user.id as string,
      items: (d.items ?? []) as ConfirmItem[],
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
