import { Request, Response } from 'express';
import { z } from 'zod';
import { DeliveryService } from '../services/delivery.service';

const deliveryService = new DeliveryService();

export class DeliveryController {
  async list(req: Request, res: Response) {
    const schema = z.object({
      status: z.enum(['pending', 'delivered']).default('pending'),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
    });

    const parsed = schema.parse(req.query);
    const result = await deliveryService.list(parsed);
    return res.json(result);
  }

  async deliver(req: Request, res: Response) {
    const { id } = req.params;
    const schema = z.object({
      deliveryType: z.enum(['com_montagem', 'sem_montagem']),
    });

    const { deliveryType } = schema.parse(req.body);
    const deliveredBy = (req as any).user?.id ?? 'unknown';

    const result = await deliveryService.deliver(id, { deliveryType, deliveredBy });
    return res.json(result);
  }
}
