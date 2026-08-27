import { Request, Response } from 'express';
import { InstallmentService } from '../services/installment.service';
import { z } from 'zod';
import { generateReceivablesPdf } from '../services/receivablesPdf.service';
import { AppError } from '../utils/AppError';

const installmentService = new InstallmentService();

export class InstallmentController {
  async getByCustomer(req: Request, res: Response) {
    const { customerId } = req.params;
    const installments = await installmentService.getByCustomer(customerId);
    return res.json(installments);
  }

  async markAsPaid(req: Request, res: Response) {
    const { id } = req.params;
    const paidSchema = z.object({
      paymentDate: z.string().optional().default(new Date().toISOString()),
      paidAmount: z.number().positive('Valor pago deve ser positivo'),
    });

    const data = paidSchema.parse(req.body);
    const userId = (req as any).user?.id;
    const result = await installmentService.markAsPaid(id, data, userId);

    return res.json(result);
  }

  async revertPayment(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const result = await installmentService.revertPayment(id, userId);
    return res.json(result);
  }

  async getInstallmentHistory(req: Request, res: Response) {
    const { customerId } = req.params;
    const result = await installmentService.getInstallmentHistory(customerId);
    return res.json(result);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateSchema = z.object({
      dueDate: z.string().optional(),
      originalAmount: z.number().positive().optional(),
    });

    const data = updateSchema.parse(req.body);
    const userId = (req as any).user?.id;
    const result = await installmentService.updateInstallment(id, data, userId);

    return res.json(result);
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user!.id;
    await installmentService.deleteInstallment(id, userId);
    return res.status(204).send();
  }

  async addToSale(req: Request, res: Response) {
    const { saleId } = req.params;
    const schema = z.object({
      installmentNumber: z.number().int().min(0),
      amount: z.number().positive(),
      dueDate: z.string().min(1),
    });
    const data = schema.parse(req.body);
    const userId = (req as any).user!.id;
    const result = await installmentService.addInstallmentToSale(saleId, data, userId);
    return res.status(201).json(result);
  }

  async addToRenegotiation(req: Request, res: Response) {
    const { renId } = req.params;
    const schema = z.object({
      installmentNumber: z.number().int().min(0),
      amount: z.number().positive(),
      dueDate: z.string().min(1),
    });
    const data = schema.parse(req.body);
    const userId = (req as any).user!.id;
    const result = await installmentService.addInstallmentToRenegotiation(renId, data, userId);
    return res.status(201).json(result);
  }

  async updateDueDate(req: Request, res: Response) {
    const { id } = req.params;
    const updateDueDateSchema = z.object({
      dueDate: z.string().min(1, "Data de vencimento é obrigatória"),
    });

    const { dueDate } = updateDueDateSchema.parse(req.body);
    const userId = (req as any).user?.id;
    const result = await installmentService.updateDueDate(id, dueDate, userId);

    return res.json(result);
  }

  async listOverdue(req: Request, res: Response) {
    const result = await installmentService.listOverdue();
    return res.json(result);
  }

  async listActiveCrediarios(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 15),
      search: z.string().optional(),
      filter: z.enum(['all', 'overdue', 'today', 'current']).optional().default('all'),
    });

    const { page, limit, search, filter } = listSchema.parse(req.query);
    const result = await installmentService.listActiveCrediariosPaginated(page, limit, search, filter);
    return res.json(result);
  }

  async getStats(req: Request, res: Response) {
    const result = await installmentService.getStats();
    return res.json(result);
  }

  async getPaymentsLast30Days(req: Request, res: Response) {
    const result = await installmentService.getPaymentsLast30Days();
    return res.json({ payments: result });
  }

  async getBillingList(req: Request, res: Response) {
    const result = await installmentService.getBillingList();
    return res.json(result);
  }

  async bulkUpdateDay(req: Request, res: Response) {
    const schema = z.object({
      customerId: z.string().min(1, 'ID do cliente é obrigatório'),
      saleId: z.string().optional(),
      newDay: z.number().int().min(1).max(31, 'Dia deve ser entre 1 e 31'),
      onlyPending: z.boolean().default(true),
    });

    try {
      const data = schema.parse(req.body);
      const result = await installmentService.bulkUpdateDay(data);
      return res.json(result);
    } catch (err: any) {
      console.error('[InstallmentController] bulkUpdateDay error:', {
        body: req.body,
        message: err?.message,
        stack: err?.stack,
      });
      throw err;
    }
  }

  async sendManualBilling(req: Request, res: Response) {
    const { customerId, installmentId } = req.body;
    const sendManualBillingSchema = z.object({
      customerId: z.string().min(1, "ID do cliente é obrigatório"),
      installmentId: z.string().min(1, "ID da parcela é obrigatório"),
    });

    const { customerId: parsedCustomerId, installmentId: parsedInstallmentId } = sendManualBillingSchema.parse(req.body);
    const result = await installmentService.sendManualBillingMessage(parsedCustomerId, parsedInstallmentId);

    return res.json(result);
  }

  async getReceivablesPdf(req: Request, res: Response) {
    const nowSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

    const schema = z.object({
      month: z.string().optional().transform(v => (v ? parseInt(v, 10) : nowSp.getMonth() + 1)),
      year:  z.string().optional().transform(v => (v ? parseInt(v, 10) : nowSp.getFullYear())),
    });

    const { month, year } = schema.parse(req.query);
    if (month < 1 || month > 12) throw new AppError('Mês inválido (1–12)', 400);
    if (year < 2020 || year > 2100) throw new AppError('Ano inválido', 400);

    const pdf = await generateReceivablesPdf(month, year);
    const filename = `recebiveis-crediario-${year}-${String(month).padStart(2, '0')}.pdf`;

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(pdf.length),
    });
    res.end(pdf);
  }
}
