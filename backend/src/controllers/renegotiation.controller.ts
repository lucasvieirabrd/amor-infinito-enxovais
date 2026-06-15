import { Request, Response } from 'express';
import { z } from 'zod';
import { RenegotiationService } from '../services/renegotiation.service';

const renegotiationService = new RenegotiationService();

export class RenegotiationController {
  async renegotiate(req: Request, res: Response) {
    const schema = z.object({
      customerId: z.string().min(1),
      installmentIds: z.array(z.string()).min(1),
      newTotalAmount: z.number().positive(),
      installmentsCount: z.number().int().positive(),
      installments: z.array(
        z.object({
          number: z.number().int().min(0),
          amount: z.number().positive(),
          dueDate: z.string().min(1),
        })
      ).min(1),
    });

    const data = schema.parse(req.body);
    const userId = (req as any).user!.id;

    const result = await renegotiationService.renegotiateDebt({ ...data, userId });
    return res.status(201).json(result);
  }
}
