import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { z } from 'zod';

const productService = new ProductService();

export class ProductController {
  async register(req: Request, res: Response) {
    const registerSchema = z.object({
      name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
      sku: z.string().min(1, 'SKU é obrigatório').optional().or(z.literal('')),
      category: z.string().max(100).optional().nullable(),
      quantity: z.number().int().nonnegative().default(0),
      price: z.number().positive('Preço deve ser maior que zero'),
      minStockLevel: z.number().int().nonnegative().default(0),
    });

    const data = registerSchema.parse(req.body);
    const product = await productService.register(data);

    return res.status(201).json(product);
  }

  async list(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 10),
      search: z.string().optional(),
      category: z.string().optional(),
    });

    const { page, limit, search, category } = listSchema.parse(req.query);
    const result = await productService.list(page, limit, search, category);

    return res.json(result);
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const product = await productService.getById(id);
    return res.json(product);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateSchema = z.object({
      name: z.string().min(3).optional(),
      sku: z.string().min(1).optional().or(z.literal('')),
      category: z.string().max(100).optional().nullable(),
      quantity: z.number().int().nonnegative().optional(),
      price: z.number().positive().optional(),
      minStockLevel: z.number().int().nonnegative().optional(),
    });

    const data = updateSchema.parse(req.body);
    const product = await productService.update(id, data);

    return res.json(product);
  }

  async categories(req: Request, res: Response) {
    const data = await productService.listCategories();
    return res.json(data);
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await productService.delete(id);
    return res.status(204).send();
  }

  /**
   * Endpoint para sincronizar dados locais com o Google Sheets manualmente.
   */
  async sync(req: Request, res: Response) {
    const result = await productService.syncFromSheet();
    return res.json(result);
  }
}
