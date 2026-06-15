import { db } from '../database';
import { installments } from '../database/schema';
import { and, isNull, inArray } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { RenegotiationRepository } from '../repositories/renegotiation.repository';

const renegotiationRepository = new RenegotiationRepository();

export class RenegotiationService {
  async renegotiateDebt(params: {
    customerId: string;
    installmentIds: string[];
    newTotalAmount: number;
    installmentsCount: number;
    installments: { number: number; amount: number; dueDate: string }[];
    userId: string;
  }) {
    const { customerId, installmentIds, newTotalAmount, installmentsCount, userId } = params;

    if (installmentIds.length === 0) {
      throw new AppError('Selecione ao menos uma parcela para renegociar', 400);
    }

    // Validate all requested installments exist, belong to customer, and are not paid
    const found = await db
      .select()
      .from(installments)
      .where(
        and(
          inArray(installments.id, installmentIds),
          eq(installments.customerId, customerId),
          isNull(installments.deletedAt),
        )
      );

    if (found.length !== installmentIds.length) {
      throw new AppError('Uma ou mais parcelas não foram encontradas ou não pertencem a este cliente', 400);
    }

    const hasPaid = found.some(i => i.status === 'paid');
    if (hasPaid) {
      throw new AppError('Não é possível renegociar parcelas já pagas', 400);
    }

    if (newTotalAmount <= 0) {
      throw new AppError('Valor total da renegociação deve ser positivo', 400);
    }

    if (installmentsCount <= 0) {
      throw new AppError('Número de parcelas deve ser positivo', 400);
    }

    if (params.installments.length === 0) {
      throw new AppError('Defina as parcelas do novo acordo', 400);
    }

    // Validate installment amounts sum matches newTotalAmount (tolerance of 1 cent per installment)
    const sumNew = params.installments.reduce((acc, i) => acc + i.amount, 0);
    if (Math.abs(sumNew - newTotalAmount) > 0.1 * params.installments.length) {
      throw new AppError('A soma das parcelas não corresponde ao valor total da renegociação', 400);
    }

    const originalAmount = found.reduce(
      (sum, i) => sum + Number(i.originalAmount) - Number(i.paidAmount || 0),
      0
    );

    return renegotiationRepository.create({
      customerId,
      installmentIds,
      originalAmount,
      newTotalAmount,
      installmentsCount,
      newInstallments: params.installments,
      userId,
    });
  }
}
