import { db } from '../database';
import { installments, renegotiations, auditLogs, saleSequence, customers } from '../database/schema';
import { eq, inArray, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class RenegotiationRepository {
  private async generateRenNumber(tx: any): Promise<string> {
    let sequence = await tx
      .select()
      .from(saleSequence)
      .where(eq(saleSequence.prefix, 'REN-'))
      .limit(1)
      .for('update');

    if (sequence.length === 0) {
      await tx.insert(saleSequence).values({ currentNumber: 0, prefix: 'REN-' });
      sequence = await tx.select().from(saleSequence).where(eq(saleSequence.prefix, 'REN-')).limit(1);
    }

    const nextNumber = sequence[0].currentNumber + 1;
    await tx.update(saleSequence).set({ currentNumber: nextNumber }).where(eq(saleSequence.id, sequence[0].id));
    return `REN-${nextNumber.toString().padStart(6, '0')}`;
  }

  async create(params: {
    customerId: string;
    installmentIds: string[];
    originalAmount: number;
    newTotalAmount: number;
    installmentsCount: number;
    newInstallments: { number: number; amount: number; dueDate: string }[];
    userId: string;
  }) {
    const { customerId, installmentIds, originalAmount, newTotalAmount, installmentsCount, newInstallments, userId } = params;

    return db.transaction(async (tx) => {
      const renId = uuidv4();
      const renNumber = await this.generateRenNumber(tx);
      const discount = Math.max(0, originalAmount - newTotalAmount);
      const now = new Date();

      await tx.insert(renegotiations).values({
        id: renId,
        renNumber,
        customerId,
        originalAmount: originalAmount.toFixed(2),
        newAmount: newTotalAmount.toFixed(2),
        discount: discount.toFixed(2),
        installmentsCount,
        createdBy: userId,
      });

      for (const instId of installmentIds) {
        await tx
          .update(installments)
          .set({ status: 'canceled', deletedAt: now, renegotiationId: renId, updatedAt: now })
          .where(eq(installments.id, instId));
      }

      for (const inst of newInstallments) {
        const date = new Date(inst.dueDate + 'T12:00:00');
        const isEntry = inst.number === 0;
        await tx.insert(installments).values({
          id: uuidv4(),
          saleId: renId,
          customerId,
          installmentNumber: inst.number,
          dueDate: date,
          originalAmount: inst.amount.toFixed(2),
          paidAmount: isEntry ? inst.amount.toFixed(2) : '0.00',
          paymentDate: isEntry ? date : null,
          status: isEntry ? 'paid' : 'pending',
        });
      }

      await tx.insert(auditLogs).values({
        id: uuidv4(),
        userId,
        action: 'RENEGOTIATE_DEBT',
        entityType: 'Customer',
        entityId: customerId,
        oldValue: { canceledInstallments: installmentIds.length, originalAmount },
        newValue: { renId, renNumber, newAmount: newTotalAmount, discount, installmentsCount },
        timestamp: now,
      });

      return { renId, renNumber, canceledCount: installmentIds.length };
    });
  }

  async findById(id: string) {
    const rows = await db
      .select({
        id: renegotiations.id,
        renNumber: renegotiations.renNumber,
        customerId: renegotiations.customerId,
        originalAmount: renegotiations.originalAmount,
        newAmount: renegotiations.newAmount,
        discount: renegotiations.discount,
        installmentsCount: renegotiations.installmentsCount,
        createdBy: renegotiations.createdBy,
        createdAt: renegotiations.createdAt,
        customerName: customers.name,
      })
      .from(renegotiations)
      .leftJoin(customers, eq(renegotiations.customerId, customers.id))
      .where(eq(renegotiations.id, id))
      .limit(1);

    if (rows.length === 0) return null;

    const insts = await db
      .select()
      .from(installments)
      .where(eq(installments.saleId, id))
      .orderBy(installments.installmentNumber);

    return { ...rows[0], installments: insts };
  }
}
