import { InstallmentRepository } from '../repositories/installment.repository';
import { BillingService } from './billing.service';
import { AppError } from '../utils/AppError';
import { isBefore, startOfDay, isToday, getDaysInMonth } from 'date-fns';
import { customers, installments, auditLogs, renegotiations } from '../database/schema';
import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { SaleRepository } from '../repositories/sale.repository';
import { eq } from 'drizzle-orm';

const installmentRepository = new InstallmentRepository();
const billingService = new BillingService();

export class InstallmentService {
  async getByCustomer(customerId: string) {
    const installments = await installmentRepository.findByCustomer(customerId);
    const today = startOfDay(new Date());

    const saleIds = [...new Set(installments.map(i => i.saleId))];
    let productInfo = new Map<string, { productNames: string | null; productCount: number; isSale: boolean }>();
    try {
      productInfo = await installmentRepository.getProductInfoBySaleIds(saleIds);
    } catch (err) {
      console.error('[InstallmentService.getByCustomer] getProductInfoBySaleIds failed:', err);
    }

    return installments.map(inst => {
      let status = inst.status;
      if (status === 'pending' && isBefore(startOfDay(new Date(inst.dueDate)), today)) {
        status = 'overdue';
      }
      const info = productInfo.get(inst.saleId);
      const saleReference = info?.isSale
        ? `VEN-${inst.saleId.slice(0, 6).toUpperCase()}`
        : `REN-${inst.saleId.slice(0, 6).toUpperCase()}`;
      return {
        ...inst,
        status,
        saleReference,
        productNames: info?.productNames ?? null,
        productCount: info?.productCount ?? 0,
      };
    });
  }

  async markAsPaid(id: string, data: { paymentDate: string; paidAmount: number }, userId?: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    if (installment.status === 'paid') {
      throw new AppError('Esta parcela já está paga', 400);
    }

    const previousPaid = installment.status === 'partial' ? Number(installment.paidAmount) : 0;
    const newPaidTotal = previousPaid + data.paidAmount;
    const originalAmount = Number(installment.originalAmount);
    const isFullyPaid = newPaidTotal >= originalAmount;

    const updated = await installmentRepository.update(id, {
      paymentDate: new Date(data.paymentDate + 'T12:00:00'),
      paidAmount: newPaidTotal.toFixed(2),
      status: isFullyPaid ? 'paid' : 'partial',
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: userId ?? 'SYSTEM',
      action: 'MARK_INSTALLMENT_PAID',
      entityType: 'Installment',
      entityId: id,
      oldValue: { status: installment.status, paidAmount: installment.paidAmount },
      newValue: { status: isFullyPaid ? 'paid' : 'partial', paidAmount: newPaidTotal.toFixed(2), paymentDate: data.paymentDate },
    });

    if (updated && isFullyPaid) {
      await billingService.handlePostPaymentMessages(updated.customerId, installment.saleId, newPaidTotal);
    }

    return updated;
  }

  async revertPayment(id: string, userId?: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    if (installment.status !== 'paid' && installment.status !== 'partial') {
      throw new AppError('Apenas parcelas pagas ou parciais podem ser revertidas', 400);
    }

    const result = await installmentRepository.update(id, {
      paymentDate: null,
      paidAmount: '0.00',
      status: 'pending',
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: userId ?? 'SYSTEM',
      action: 'REVERT_INSTALLMENT_PAYMENT',
      entityType: 'Installment',
      entityId: id,
      oldValue: { status: installment.status, paidAmount: installment.paidAmount, paymentDate: installment.paymentDate },
      newValue: { status: 'pending', paidAmount: '0.00', paymentDate: null },
    });

    return result;
  }

  async updateInstallment(id: string, data: { dueDate?: string; originalAmount?: number }, userId?: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    if (installment.status === 'paid') {
      if (data.dueDate) {
        throw new AppError('Não é possível alterar a data de vencimento de uma parcela já paga', 400);
      }
      if (data.originalAmount === undefined) return installment;

      const newAmount = data.originalAmount;

      // Update both originalAmount and paidAmount — admin-only, no billing triggered
      const result = await installmentRepository.update(id, {
        originalAmount: newAmount.toFixed(2),
        paidAmount: newAmount.toFixed(2),
      });

      if (userId) {
        await db.insert(auditLogs).values({
          id: uuidv4(),
          userId,
          action: 'UPDATE_INSTALLMENT',
          entityType: 'Installment',
          entityId: id,
          oldValue: { originalAmount: installment.originalAmount, paidAmount: installment.paidAmount },
          newValue: { originalAmount: newAmount, paidAmount: newAmount },
        });
      }
      return result;
    }

    const updateData: any = {};
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate + 'T12:00:00');
    if (data.originalAmount !== undefined) updateData.originalAmount = data.originalAmount.toFixed(2);

    const result = await installmentRepository.update(id, updateData);

    if (userId) {
      await db.insert(auditLogs).values({
        id: uuidv4(),
        userId,
        action: 'UPDATE_INSTALLMENT',
        entityType: 'Installment',
        entityId: id,
        oldValue: { dueDate: installment.dueDate, originalAmount: installment.originalAmount },
        newValue: data,
      });
    }

    return result;
  }

  async updateDueDate(id: string, newDueDate: string, userId?: string) {
    const existingInstallment = await installmentRepository.findById(id);
    if (!existingInstallment) {
      throw new AppError('Parcela não encontrada', 404);
    }
    let status = existingInstallment.status;
    const today = startOfDay(new Date());
    const newDate = new Date(newDueDate + 'T12:00:00');
    const newDateMidnight = startOfDay(newDate);

    if (newDateMidnight < today && existingInstallment.status === 'pending') {
      status = 'overdue';
    } else if (newDateMidnight >= today && existingInstallment.status === 'overdue') {
      status = 'pending';
    }

    const result = await installmentRepository.update(id, { dueDate: newDate, status });

    if (userId) {
      await db.insert(auditLogs).values({
        id: uuidv4(),
        userId,
        action: 'UPDATE_INSTALLMENT_DATE',
        entityType: 'Installment',
        entityId: id,
        oldValue: { dueDate: existingInstallment.dueDate },
        newValue: { dueDate: newDate },
      });
    }

    return result;
  }

  async listOverdue() {
    const result = await installmentRepository.listOverdue();
    
    // Agrupar por cliente
    const grouped: any = {};
    
    result.forEach(row => {
      const { customer, installment } = row;
      if (!grouped[customer.id]) {
        grouped[customer.id] = {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          totalOverdue: 0,
          installmentsCount: 0,
          overdueInstallments: []
        };
      }
      
      const amount = Number(installment.originalAmount);
      grouped[customer.id].totalOverdue += amount;
      grouped[customer.id].installmentsCount += 1;
      grouped[customer.id].overdueInstallments.push(installment);
    });
    
    return Object.values(grouped);
  }

  async listActiveCrediarios() {
    return installmentRepository.listActiveCrediarios();
  }

  async listActiveCrediariosPaginated(page: number, limit: number, search?: string, filter?: string) {
    return installmentRepository.listActiveCrediariosPaginated(page, limit, search, filter);
  }

  async getStats() {
    return installmentRepository.getStats();
  }

  async getPaymentsLast30Days() {
    return installmentRepository.getPaymentsLast30Days();
  }

  async getBillingList() {
    const rows = await installmentRepository.listPendingOverdue();

    const saleIds = [...new Set(rows.map(r => r.installment.saleId))];
    let productInfo = new Map<string, { productNames: string | null; productCount: number; isSale: boolean }>();
    try {
      productInfo = await installmentRepository.getProductInfoBySaleIds(saleIds);
    } catch (err) {
      console.error('[InstallmentService.getBillingList] getProductInfoBySaleIds failed:', err);
    }

    return rows.map(row => {
      const info = productInfo.get(row.installment.saleId);
      const saleReference = info?.isSale
        ? `VEN-${row.installment.saleId.slice(0, 6).toUpperCase()}`
        : `REN-${row.installment.saleId.slice(0, 6).toUpperCase()}`;
      return {
        id: row.installment.id,
        customerId: row.customer.id,
        customerName: row.customer.name,
        customerPhone: row.customer.phone,
        inLegalProcess: row.customer.inLegalProcess,
        installmentNumber: row.installment.installmentNumber,
        originalAmount: Number(row.installment.originalAmount),
        paidAmount: row.installment.paidAmount ? Number(row.installment.paidAmount) : null,
        paymentDate: row.installment.paymentDate,
        dueDate: row.installment.dueDate,
        status: row.installment.status,
        daysOverdue: Math.floor(
          (new Date().getTime() - new Date(row.installment.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        ),
        saleReference,
        productNames: info?.productNames ?? null,
        productCount: info?.productCount ?? 0,
      };
    });
  }

  async bulkUpdateDay(params: {
    customerId: string;
    saleId?: string;
    newDay: number;
    onlyPending: boolean;
  }) {
    const { customerId, saleId, newDay, onlyPending } = params;

    const list = await installmentRepository.findByCustomerFiltered(customerId, saleId, onlyPending);
    if (list.length === 0) {
      throw new AppError('Nenhuma parcela encontrada para atualizar', 404);
    }

    const today = startOfDay(new Date());
    const updated = [];

    for (const inst of list) {
      const current = new Date(inst.dueDate);
      // Clamp: se o mês não tiver dias suficientes usa o último dia do mês
      // Ex: dia 31 em abril → 30; dia 31 em fevereiro → 28/29
      const diaReal = Math.min(newDay, getDaysInMonth(current));
      const newDate = new Date(current.getFullYear(), current.getMonth(), diaReal, 12, 0, 0);
      const newDateMidnight = startOfDay(newDate);

      let status = inst.status;
      if (newDateMidnight < today && inst.status === 'pending') status = 'overdue';
      else if (newDateMidnight >= today && inst.status === 'overdue') status = 'pending';

      const result = await installmentRepository.update(inst.id, { dueDate: newDate, status });
      if (result) updated.push(result);
    }

    return { updated: updated.length };
  }

  async deleteInstallment(id: string, userId: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }
    if (installment.status === 'paid') {
      throw new AppError('Não é possível remover uma parcela já paga', 400);
    }

    await installmentRepository.softDelete(id);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'DELETE_INSTALLMENT',
      entityType: 'Installment',
      entityId: id,
      oldValue: { installmentNumber: installment.installmentNumber, originalAmount: installment.originalAmount },
      newValue: null,
    });
  }

  async addInstallmentToSale(saleId: string, data: { installmentNumber: number; amount: number; dueDate: string }, userId: string) {
    const saleRepository = new SaleRepository();
    const sale = await saleRepository.findById(saleId);
    if (!sale) {
      throw new AppError('Venda não encontrada', 404);
    }

    const isEntry = data.installmentNumber === 0;
    const date = new Date(data.dueDate + 'T12:00:00');

    const newInstallment = await installmentRepository.createOne({
      saleId,
      customerId: sale.customerId,
      installmentNumber: data.installmentNumber,
      dueDate: date,
      originalAmount: data.amount.toFixed(2),
      ...(isEntry && { paidAmount: data.amount.toFixed(2), paymentDate: date }),
      status: isEntry ? 'paid' : 'pending',
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'ADD_INSTALLMENT',
      entityType: 'Installment',
      entityId: newInstallment!.id,
      oldValue: null,
      newValue: { saleId, installmentNumber: data.installmentNumber, amount: data.amount, dueDate: data.dueDate },
    });

    return newInstallment;
  }

  async addInstallmentToRenegotiation(renId: string, data: { installmentNumber: number; amount: number; dueDate: string }, userId: string) {
    const [ren] = await db.select().from(renegotiations).where(eq(renegotiations.id, renId)).limit(1);
    if (!ren) {
      throw new AppError('Renegociação não encontrada', 404);
    }

    const isEntry = data.installmentNumber === 0;
    const date = new Date(data.dueDate + 'T12:00:00');

    const newInstallment = await installmentRepository.createOne({
      saleId: renId,
      customerId: ren.customerId,
      installmentNumber: data.installmentNumber,
      dueDate: date,
      originalAmount: data.amount.toFixed(2),
      ...(isEntry && { paidAmount: data.amount.toFixed(2), paymentDate: date }),
      status: isEntry ? 'paid' : 'pending',
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'ADD_INSTALLMENT',
      entityType: 'Installment',
      entityId: newInstallment!.id,
      oldValue: null,
      newValue: { renegotiationId: renId, installmentNumber: data.installmentNumber, amount: data.amount, dueDate: data.dueDate },
    });

    return newInstallment;
  }

  async getInstallmentHistory(customerId: string) {
    const rows = await installmentRepository.getInstallmentHistoryForCustomer(customerId);
    const grouped = new Map<string, { tipo: 'baixa' | 'reversao'; userName: string | null; dataHora: string }[]>();
    for (const row of rows) {
      if (!grouped.has(row.installmentId)) grouped.set(row.installmentId, []);
      grouped.get(row.installmentId)!.push({
        tipo: row.action === 'MARK_INSTALLMENT_PAID' ? 'baixa' : 'reversao',
        userName: row.userName,
        dataHora: row.dataHora,
      });
    }
    return Object.fromEntries(grouped);
  }

  async sendManualBillingMessage(customerId: string, installmentId: string) {
    const installment = await installmentRepository.findById(installmentId);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    // Aqui você pode adicionar a lógica para buscar os detalhes do cliente
    // e da parcela para enviar a mensagem de cobrança.
    // Por exemplo, usando o billingService.sendBillingMessage
    await billingService.sendBillingMessage(customerId, installment.id, Number(installment.originalAmount), installment.dueDate);

    return { message: 'Mensagem de cobrança manual enviada com sucesso!' };
  }
}

