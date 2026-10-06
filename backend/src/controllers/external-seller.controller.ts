import { Request, Response } from 'express';
import { z } from 'zod';
import { ExternalSellerRepository } from '../repositories/external-seller.repository';
import { AppError } from '../utils/AppError';

const repo = new ExternalSellerRepository();

const createSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  code: z.string().min(1, 'Código é obrigatório').max(20).regex(/^[A-Za-z0-9_-]+$/, 'Código deve conter apenas letras, números, _ ou -'),
  canScheduleSameDay: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/).optional(),
  active: z.boolean().optional(),
  canScheduleSameDay: z.boolean().optional(),
});

export class ExternalSellerController {
  async list(_req: Request, res: Response) {
    const data = await repo.findAll();
    res.json(data);
  }

  async create(req: Request, res: Response) {
    const body = createSchema.parse(req.body);
    const conflict = await repo.findByCodeAdmin(body.code);
    if (conflict) throw new AppError('Já existe um vendedor com este código', 409);
    const created = await repo.create(body.name, body.code, body.canScheduleSameDay ?? false);
    res.status(201).json(created);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await repo.findById(id);
    if (!existing) throw new AppError('Vendedor externo não encontrado', 404);
    const body = updateSchema.parse(req.body);
    if (body.code && body.code !== existing.code) {
      const conflict = await repo.findByCodeAdmin(body.code, id);
      if (conflict) throw new AppError('Já existe um vendedor com este código', 409);
    }
    const updated = await repo.update(id, body);
    res.json(updated);
  }

  async remove(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await repo.findById(id);
    if (!existing) throw new AppError('Vendedor externo não encontrado', 404);
    await repo.softDelete(id);
    res.status(204).send();
  }
}
