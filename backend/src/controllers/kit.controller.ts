import { Request, Response } from 'express';
import { KitService } from '../services/kit.service';
import { z } from 'zod';

const kitService = new KitService();

const componentSchema = z.object({
  componentProductId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export class KitController {
  async list(req: Request, res: Response) {
    const kits = await kitService.list();
    return res.json(kits);
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const kit = await kitService.getById(id);
    return res.json(kit);
  }

  async create(req: Request, res: Response) {
    const schema = z.object({
      name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
      sku: z.string().min(1).optional().or(z.literal('')),
      category: z.string().max(100).optional().nullable(),
      description: z.string().max(255).optional().nullable(),
      minStockLevel: z.number().int().nonnegative().default(0),
      components: z.array(componentSchema).min(1, 'Kit deve ter ao menos um componente'),
    });

    const { components, ...data } = schema.parse(req.body);
    const userId = (req as any).user!.id as string;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '';

    const kit = await kitService.create(data, components, userId, ipAddress);
    return res.status(201).json(kit);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const schema = z.object({
      name: z.string().min(3).optional(),
      sku: z.string().min(1).optional().or(z.literal('')),
      category: z.string().max(100).optional().nullable(),
      description: z.string().max(255).optional().nullable(),
      minStockLevel: z.number().int().nonnegative().optional(),
      components: z.array(componentSchema).min(1).optional(),
    });

    const { components, ...data } = schema.parse(req.body);
    const userId = (req as any).user!.id as string;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '';

    const kit = await kitService.update(id, data, components, userId, ipAddress);
    return res.json(kit);
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user!.id as string;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    await kitService.delete(id, userId, ipAddress);
    return res.status(204).send();
  }
}
