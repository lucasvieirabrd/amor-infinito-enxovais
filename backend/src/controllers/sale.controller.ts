import { Request, Response } from 'express';
import { SaleService } from '../services/sale.service';
import { z } from 'zod';

const saleService = new SaleService();

export class SaleController {
  async register(req: Request, res: Response) {
    const registerSchema = z.object({
      customerId: z.string().uuid('ID do cliente inválido'),
      paymentMethod: z.enum(['cash', 'credit_card', 'installment']),
      items: z.array(z.object({
        productId: z.string().uuid('ID do produto inválido'),
        quantity: z.number().int().positive('Quantidade deve ser positiva'),
        unitPrice: z.number().positive('Preço unitário deve ser positivo'),
      })).min(1, 'A venda deve ter pelo menos um item'),
      installmentsCount: z.number().int().min(1).max(30).optional(),
      saleDate: z.string().optional(),
      customInstallments: z.array(z.object({
        dueDate: z.string(),
        amount: z.number().positive(),
      })).optional(),
    });

    const data = registerSchema.parse(req.body);
    const userId = req.user!.id; // Garantido pelo middleware ensureAuthenticated

    const result = await saleService.register(data, userId);

    return res.status(201).json(result);
  }

  async list(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 10),
    });

    const { page, limit } = listSchema.parse(req.query);
    const result = await saleService.list(page, limit);

    return res.json(result);
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const sale = await saleService.getById(id);
    return res.json(sale);
  }

  async listWithFilters(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 10),
      customerId: z.string().optional(),
      paymentMethod: z.enum(['cash', 'credit_card', 'installment']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
    });

    const filters = listSchema.parse(req.query);
    const result = await saleService.listWithFilters(filters);

    return res.json(result);
  }

  async cancel(req: Request, res: Response) {
    const { id } = req.params;
    const userRole = req.user!.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem cancelar vendas' });
    }

    const result = await saleService.cancel(id);
    return res.json(result);
  }

  async getTotalSales(req: Request, res: Response) {
    console.log('GET /sales/total-sales chamado');
    const totalSales = await saleService.getTotalSales();
    return res.json({ totalSales });
  }

  async getSalesLast7Days(req: Request, res: Response) {
    console.log('GET /sales/sales-last-7-days chamado');
    const salesLast7Days = await saleService.getSalesLast7Days();
    return res.json({ salesLast7Days });
  }
}
