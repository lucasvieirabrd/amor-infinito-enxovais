import { Request, Response } from 'express';
import { PayableService } from '../services/payable.service';

const payableService = new PayableService();

export class PayableController {
  list = async (req: Request, res: Response) => {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;

    const data = await payableService.listPayables(month, year, search, category);
    res.json(data);
  };

  summary = async (req: Request, res: Response) => {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();

    const data = await payableService.getSummary(month, year);
    res.json(data);
  };

  create = async (req: Request, res: Response) => {
    const { recurrenceId, description, category, amount, dueDate, notes } = req.body;
    const created = await payableService.createPayable({
      recurrenceId,
      description,
      category,
      amount: amount != null ? Number(amount) : undefined,
      dueDate,
      notes,
      createdBy: req.user?.id,
    });
    res.status(201).json(created);
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { description, category, amount, dueDate, notes } = req.body;
    const updated = await payableService.updatePayable(id, { description, category, amount, dueDate, notes });
    res.json(updated);
  };

  pay = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { paidAmount, paidAt } = req.body;
    const updated = await payableService.markAsPaid(id, Number(paidAmount), paidAt);
    res.json(updated);
  };

  revert = async (req: Request, res: Response) => {
    const { id } = req.params;
    const updated = await payableService.revertPayment(id);
    res.json(updated);
  };

  remove = async (req: Request, res: Response) => {
    const { id } = req.params;
    await payableService.deletePayable(id);
    res.status(204).send();
  };

  // ─── Recurrences ───────────────────────────────────────────────────────────

  listRecurrences = async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await payableService.listRecurrences(includeInactive);
    res.json(data);
  };

  createRecurrence = async (req: Request, res: Response) => {
    const { description, category, amount, isVariable, dueDay, notes } = req.body;
    const created = await payableService.createRecurrence({
      description,
      category,
      amount: amount != null ? Number(amount) : undefined,
      isVariable: Boolean(isVariable),
      dueDay: Number(dueDay),
      notes,
    });
    res.status(201).json(created);
  };

  updateRecurrence = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { description, category, amount, isVariable, dueDay, active, notes } = req.body;
    const updated = await payableService.updateRecurrence(id, {
      description,
      category,
      amount: amount !== undefined ? (amount != null ? Number(amount) : null) : undefined,
      isVariable: isVariable !== undefined ? Boolean(isVariable) : undefined,
      dueDay: dueDay !== undefined ? Number(dueDay) : undefined,
      active: active !== undefined ? Boolean(active) : undefined,
      notes,
    });
    res.json(updated);
  };

  removeRecurrence = async (req: Request, res: Response) => {
    const { id } = req.params;
    await payableService.deleteRecurrence(id);
    res.status(204).send();
  };
}
