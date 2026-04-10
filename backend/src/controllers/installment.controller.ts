import { Request, Response } from 'express';
import { InstallmentService } from '../services/installment.service';
import { z } from 'zod';

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
    const result = await installmentService.markAsPaid(id, data);

    return res.json(result);
  }

  async revertPayment(req: Request, res: Response) {
    const { id } = req.params;
    const result = await installmentService.revertPayment(id);
    return res.json(result);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateSchema = z.object({
      dueDate: z.string().optional(),
      originalAmount: z.number().positive().optional(),
    });

    const data = updateSchema.parse(req.body);
    const result = await installmentService.updateInstallment(id, data);

    return res.json(result);
  }

  async updateDueDate(req: Request, res: Response) {
    const { id } = req.params;
    const updateDueDateSchema = z.object({
      dueDate: z.string().min(1, "Data de vencimento é obrigatória"),
    });

    const { dueDate } = updateDueDateSchema.parse(req.body);
    const result = await installmentService.updateDueDate(id, dueDate);

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
    });

    const { page, limit, search } = listSchema.parse(req.query);
    const result = await installmentService.listActiveCrediariosPaginated(page, limit, search);
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
      newDay: z.number().int().min(1).max(28, 'Dia deve ser entre 1 e 28'),
      onlyPending: z.boolean().default(true),
    });

    const data = schema.parse(req.body);
    const result = await installmentService.bulkUpdateDay(data);
    return res.json(result);
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
}
