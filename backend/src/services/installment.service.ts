import { InstallmentRepository } from '../repositories/installment.repository';
import { BillingService } from './billing.service';
import { AppError } from '../utils/AppError';
import { isBefore, startOfDay } from 'date-fns';

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

    const updated = await installmentRepository.update(id, {
      paymentDate: new Date(data.paymentDate),
      paidAmount: data.paidAmount.toFixed(2),
      status: 'paid',
    });

    // Disparar template 'confirmacao_pagamento' via WhatsApp API automaticamente
    if (updated) {
      await billingService.sendPaymentConfirmation(updated.customerId, data.paidAmount);
    }

    return updated;
  }

  async revertPayment(id: string) {
    const installment = await installmentRepository.findById(id);
    if (!installment) {
      throw new AppError('Parcela não encontrada', 404);
    }

    if (installment.status !== 'paid') {
      throw new AppError('Apenas parcelas pagas podem ser revertidas', 400);
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
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.originalAmount !== undefined) updateData.originalAmount = data.originalAmount.toFixed(2);

    return installmentRepository.update(id, updateData);
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
      
      const amount = parseFloat(installment.originalAmount.toString());
      grouped[customer.id].totalOverdue += amount;
      grouped[customer.id].installmentsCount += 1;
      grouped[customer.id].overdueInstallments.push(installment);
    });
    
    return Object.values(grouped);
  }

  async listActiveCrediarios() {
    return installmentRepository.listActiveCrediarios();
  }
}
