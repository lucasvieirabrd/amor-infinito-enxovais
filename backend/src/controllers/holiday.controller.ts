import { Request, Response } from 'express';
import { HolidayRepository } from '../repositories/holiday.repository';
import { AppError } from '../utils/AppError';

const repo = new HolidayRepository();

export class HolidayController {
  async list(req: Request, res: Response) {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const data = await repo.findAll(year);
    res.json(data);
  }

  async create(req: Request, res: Response) {
    const { date, description } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Data inválida (esperado YYYY-MM-DD)', 400);
    }
    if (!description?.trim()) {
      throw new AppError('Descrição é obrigatória', 400);
    }
    const existing = await repo.findByDate(date);
    if (existing) throw new AppError('Já existe um feriado nesta data', 409);
    const created = await repo.create(date, description.trim());
    res.status(201).json(created);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const { date, description } = req.body;
    const existing = await repo.findById(id);
    if (!existing) throw new AppError('Feriado não encontrado', 404);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Data inválida (esperado YYYY-MM-DD)', 400);
    }
    if (date && date !== existing.date) {
      const conflict = await repo.findByDate(date);
      if (conflict) throw new AppError('Já existe um feriado nesta data', 409);
    }
    const updated = await repo.update(id, {
      date: date?.trim(),
      description: description?.trim(),
    });
    res.json(updated);
  }

  async remove(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await repo.findById(id);
    if (!existing) throw new AppError('Feriado não encontrado', 404);
    await repo.softDelete(id);
    res.status(204).send();
  }
}
