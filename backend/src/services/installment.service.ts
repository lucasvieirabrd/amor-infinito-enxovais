import { InstallmentRepository } from '../repositories/installment.repository';
import { BillingService } from './billing.service';
import { AppError } from '../utils/AppError';
import { isBefore, startOfDay, isToday, getDaysInMonth } from 'date-fns';
import { customers, installments } from '../database/schema';

const installmentRepository = new InstallmentRepository();
const billingService = new BillingService();

export class InstallmentService {
  async getByCustomer(customerId: string) {
    const installments = await installmentRepository.findByCustomer(customerId);
    
    // Mapear status atualizado (vencido/pendente)
    const today = startOfDay(new Date());
    
    return installments.map(inst => {
      let status = inst.status;
      if (status === 'pending' && isBefore(startOfDay(new Date(inst.dueDate)), today)) {
        status = 'overdue';
      }
      return { ...inst, status };
    });
  }

  async markAsPaid(id: string, data: { paymentDate: string; paidAmount: number }) {
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

    if (updated && isFullyPaid) {
      await billingService.sendPaymentConfirmation(updated.customerId, newPaidTotal);
    }

    return updated;
  }

  async revertPayment(id: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    if (installment.status !== 'paid' && installment.status !== 'partial') {
      throw new AppError('Apenas parcelas pagas ou parciais podem ser revertidas', 400);
    }

    return installmentRepository.update(id, {
      paymentDate: null,
      paidAmount: '0.00',
      status: 'pending',
    });
  }

  async updateInstallment(id: string, data: { dueDate?: string; originalAmount?: number }) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    const updateData: any = {};
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate + 'T12:00:00');
    if (data.originalAmount !== undefined) updateData.originalAmount = data.originalAmount.toFixed(2);

    return installmentRepository.update(id, updateData);
  }

  async updateDueDate(id: string, newDueDate: string) {
    const existingInstallment = await installmentRepository.findById(id);
    if (!existingInstallment) {
      throw new AppError('Parcela não encontrada', 404);
    }
    // Se a nova data de vencimento for anterior à data atual e o status for 'pending', mudar para 'overdue'
    let status = existingInstallment.status;
    const today = startOfDay(new Date());
    const newDate = new Date(newDueDate + 'T12:00:00');
    const newDateMidnight = startOfDay(newDate);

    if (newDateMidnight < today && existingInstallment.status === 'pending') {
      status = 'overdue';
    } else if (newDateMidnight >= today && existingInstallment.status === 'overdue') {
      status = 'pending';
    }

    return installmentRepository.update(id, { dueDate: newDate, status });
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

  async listActiveCrediariosPaginated(page: number, limit: number, search?: string) {
    return installmentRepository.listActiveCrediariosPaginated(page, limit, search);
  }

  async getStats() {
    return installmentRepository.getStats();
  }

  async getPaymentsLast30Days() {
    return installmentRepository.getPaymentsLast30Days();
  }

  async getBillingList() {
    const rows = await installmentRepository.listPendingOverdue();

    return rows.map(row => ({
      id: row.installment.id,
      customerId: row.customer.id,
      customerName: row.customer.name,
      customerPhone: row.customer.phone,
      installmentNumber: row.installment.installmentNumber,
      originalAmount: Number(row.installment.originalAmount),
      paidAmount: row.installment.paidAmount ? Number(row.installment.paidAmount) : null,
      paymentDate: row.installment.paymentDate,
      dueDate: row.installment.dueDate,
      status: row.installment.status,
      daysOverdue: Math.floor(
        (new Date().getTime() - new Date(row.installment.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
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

