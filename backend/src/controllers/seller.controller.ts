import { Request, Response } from 'express';
import { z } from 'zod';
import { SellerService } from '../services/seller.service';

const sellerService = new SellerService();

export class SellerController {
  async list(req: Request, res: Response) {
    const activeOnly = req.query.active === 'true';
    const data = activeOnly ? await sellerService.listActive() : await sellerService.list();
    return res.json(data);
  }

  async create(req: Request, res: Response) {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const result = await sellerService.create(name);
    return res.status(201).json(result);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = z.object({
      name: z.string().min(1).optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    await sellerService.update(id, data);
    return res.json({ message: 'Vendedor atualizado' });
  }

  async remove(req: Request, res: Response) {
    const { id } = req.params;
    await sellerService.remove(id);
    return res.json({ message: 'Vendedor removido' });
  }
}
