import { Request, Response } from 'express';
import { z } from 'zod';
import { RenegotiationService } from '../services/renegotiation.service';
import { RenegotiationRepository } from '../repositories/renegotiation.repository';
import { AppError } from '../utils/AppError';

const renegotiationService = new RenegotiationService();
const renegotiationRepository = new RenegotiationRepository();

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

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const ren = await renegotiationRepository.findById(id);
    if (!ren) throw new AppError('Renegociação não encontrada', 404);
    return res.json(ren);
  }
}
