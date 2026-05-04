import { parse } from 'csv-parse/sync';
import { db } from '../database';
import { customers, sales, installments } from '../database/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { SaleRepository } from '../repositories/sale.repository';
import { addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

const saleRepository = new SaleRepository();

interface ImportResult {
  newCustomers: number;
  existingCustomers: number;
  totalDebts: number;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  overdueInstallments: number;
  errors: Array<{ line: number; customer: string; reason: string }>;
  notes: Array<{ line: number; customer: string; message: string }>;
}

interface FindOrCreateResult {
  id: string;
  isNew: boolean;
  note?: string;
}

export class CustomerImportService {
  async importFromCSV(fileBuffer: Buffer): Promise<ImportResult> {
    const result: ImportResult = {
      newCustomers: 0,
      existingCustomers: 0,
      totalDebts: 0,
      totalInstallments: 0,
      paidInstallments: 0,
      pendingInstallments: 0,
      overdueInstallments: 0,
      errors: [],
      notes: [],
    };

    const records = parse(fileBuffer, {
      columns: [
        'name',
        'phone',
        'email',
        'cpf',
        'address',
        'city',
        'state',
        'cep',
        'totalDebt',
        'totalInstallments',
        'installmentValue',
        'paidInstallments',
        'dueDate',
      ],
      skip_empty_lines: true,
      from: 2, // Pular cabeçalho
      encoding: 'utf-8',
    });

    // Processar em lotes de 50
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await this.processBatch(batch, result, i);
    }

    return result;
  }

  private async processBatch(
    batch: any[],
    result: ImportResult,
    startIndex: number
  ): Promise<void> {
    return await db.transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const lineNumber = startIndex + i + 2; // +2 para considerar o cabeçalho
        const row = batch[i];

        try {
          if (!row.name || !row.phone) {
            throw new Error('Nome e telefone são obrigatórios');
          }

          const cleanPhone = this.cleanPhone(row.phone);
          let cleanCPF = this.cleanCPF(row.cpf);

          // CPF vazio → gera CPF provisório baseado no telefone
          // Formato: 'F' + phone (máx 14 chars, cabe em varchar(14))
          let provisionalCpf = false;
          if (!cleanCPF) {
            cleanCPF = `F${cleanPhone}`.slice(0, 14);
            provisionalCpf = true;
          }

          const customer = await this.findOrCreateCustomer(
            {
              name: row.name,
              phone: cleanPhone,
              email: row.email || null,
              cpf: cleanCPF,
              address: row.address || null,
              city: row.city || null,
              state: row.state || null,
              cep: row.cep || null,
            },
            tx
          );

          if (customer.isNew) {
            result.newCustomers++;
            if (provisionalCpf) {
              result.notes.push({
                line: lineNumber,
                customer: row.name,
                message: `CPF vazio — cliente importado com CPF provisório (${cleanCPF})`,
              });
            }
          } else {
            result.existingCustomers++;
            if (customer.note) {
              result.notes.push({
                line: lineNumber,
                customer: row.name,
                message: customer.note,
              });
            }
          }

          // Criar venda e parcelas
          const totalDebt = parseFloat(row.totalDebt);
          const totalInstallmentsCount = parseInt(row.totalInstallments);
          const installmentValue = parseFloat(row.installmentValue);
          const paidInstallmentsCount = parseInt(row.paidInstallments);
          const dueDate = this.parseDate(row.dueDate);

          if (isNaN(totalDebt) || isNaN(totalInstallmentsCount) || isNaN(installmentValue)) {
            throw new Error('Valores de dívida, parcelas ou valor da parcela inválidos');
          }

          // Deduplicação: mesma dívida = mesmo cliente + mesmo total + mesmo nº de parcelas.
          // Permite múltiplas dívidas legítimas desde que difiram em valor ou nº de parcelas.
          const existingSale = await tx
            .select({ id: sales.id, saleNumber: sales.saleNumber })
            .from(sales)
            .where(
              and(
                eq(sales.customerId, customer.id),
                isNull(sales.deletedAt),
                sql`${sales.totalAmount} = ${totalDebt.toFixed(2)}`,
                sql`${sales.installmentsCount} = ${totalInstallmentsCount}`
              )
            )
            .limit(1);

          if (existingSale.length > 0) {
            result.notes.push({
              line: lineNumber,
              customer: row.name,
              message: `Duplicata ignorada: ${row.name} - R$${totalDebt.toFixed(2)} em ${totalInstallmentsCount}x (já existe ${existingSale[0].saleNumber})`,
            });
            continue;
          }

          const saleNumber = await saleRepository.generateSaleNumber(tx);
          const saleId = uuidv4();

          await tx.insert(sales).values({
            id: saleId,
            saleNumber: `IMP-${saleNumber.split('-')[1]}`,
            customerId: customer.id,
            userId: 'system',
            paymentMethod: 'installment',
            totalAmount: totalDebt.toFixed(2),
            installmentsCount: totalInstallmentsCount,
            saleDate: new Date(),
            isImported: true,
          });

          result.totalDebts++;

          for (let j = 1; j <= totalInstallmentsCount; j++) {
            const installmentId = uuidv4();
            let dueDateTime: Date;
            let status: 'paid' | 'pending' | 'overdue';
            let paidAmount = 0;
            let paymentDate: Date | null = null;

            if (j <= paidInstallmentsCount) {
              dueDateTime = subMonths(dueDate, totalInstallmentsCount - j);
              status = 'paid';
              paidAmount = installmentValue;
              paymentDate = dueDateTime;
              result.paidInstallments++;
            } else {
              dueDateTime = addMonths(dueDate, j - paidInstallmentsCount - 1);
              const today = startOfDay(new Date());

              if (isBefore(dueDateTime, today)) {
                status = 'overdue';
                result.overdueInstallments++;
              } else {
                status = 'pending';
                result.pendingInstallments++;
              }
            }

            await tx.insert(installments).values({
              id: installmentId,
              saleId,
              customerId: customer.id,
              installmentNumber: j,
              originalAmount: installmentValue.toFixed(2),
              paidAmount: paidAmount.toFixed(2),
              dueDate: dueDateTime,
              paymentDate,
              status,
            });

            result.totalInstallments++;
          }
        } catch (error) {
          result.errors.push({
            line: lineNumber,
            customer: row.name || 'Desconhecido',
            reason: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }
    });
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private cleanCPF(cpf: string): string {
    if (!cpf) return '';
    return cpf.replace(/\D/g, '');
  }

  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  private async findOrCreateCustomer(
    data: any,
    tx: any
  ): Promise<FindOrCreateResult> {
    // Buscar por CPF (cobre tanto CPF real quanto CPF provisório gerado da linha anterior)
    if (data.cpf) {
      const byCpf = await tx
        .select()
        .from(customers)
        .where(eq(customers.cpf, data.cpf))
        .limit(1);

      if (byCpf.length > 0) {
        return {
          id: byCpf[0].id,
          isNew: false,
          note: `Cliente já existente (encontrado por CPF)`,
        };
      }
    }

    // Buscar por telefone (cliente com dívida diferente no mesmo CSV)
    if (data.phone) {
      const byPhone = await tx
        .select()
        .from(customers)
        .where(eq(customers.phone, data.phone))
        .limit(1);

      if (byPhone.length > 0) {
        return {
          id: byPhone[0].id,
          isNew: false,
          note: `Cliente já existente (encontrado por telefone)`,
        };
      }
    }

    // Criar novo cliente
    const customerId = uuidv4();
    await tx.insert(customers).values({ id: customerId, ...data });
    return { id: customerId, isNew: true };
  }
}
