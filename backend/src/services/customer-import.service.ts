import { parse } from 'csv-parse/sync';
import { CustomerRepository } from '../repositories/customer.repository';
import { SaleRepository } from '../repositories/sale.repository';
import { AppError } from '../utils/AppError';
import { addMonths, subMonths, isAfter, isBefore, startOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

const customerRepository = new CustomerRepository();
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
    };

    // Parse CSV
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
          // Validar dados obrigatórios
          if (!row.name || !row.phone) {
            throw new Error('Nome e telefone são obrigatórios');
          }

          // Limpar dados
          const cleanPhone = this.cleanPhone(row.phone);
          const cleanCPF = this.cleanCPF(row.cpf);

          // Buscar ou criar cliente
          let customer = await this.findOrCreateCustomer(
            {
              name: row.name,
              phone: cleanPhone,
              email: row.email || null,
              cpf: cleanCPF || null,
              address: row.address || null,
              city: row.city || null,
              state: row.state || null,
              cep: row.cep || null,
            },
            tx
          );

          if (customer.isNew) {
            result.newCustomers++;
          } else {
            result.existingCustomers++;
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

          // Criar venda
          const saleNumber = await saleRepository.generateSaleNumber(tx);
          const saleId = uuidv4();

          await db.insert(sales).values({
            id: saleId,
            saleNumber: `IMP-${saleNumber.split('-')[1]}`, // Usar formato IMP-XXXXXX
            customerId: customer.id,
            userId: 'system', // Importação do sistema
            paymentMethod: 'installment',
            totalAmount: totalDebt.toFixed(2),
            installmentsCount: totalInstallmentsCount,
            saleDate: new Date(),
            status: 'active',
          });

          result.totalDebts++;

          // Criar parcelas
          for (let j = 1; j <= totalInstallmentsCount; j++) {
            const installmentId = uuidv4();
            let dueDateTime: Date;
            let status: 'paid' | 'pending' | 'overdue';
            let paidAmount = 0;
            let paymentDate: Date | null = null;

            if (j <= paidInstallmentsCount) {
              // Parcelas já pagas
              dueDateTime = subMonths(dueDate, totalInstallmentsCount - j);
              status = 'paid';
              paidAmount = installmentValue;
              paymentDate = dueDateTime;
              result.paidInstallments++;
            } else {
              // Parcelas pendentes
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

            await db.insert(installments).values({
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
    // Formato esperado: DD/MM/YYYY
    const [day, month, year] = dateStr.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  private async findOrCreateCustomer(
    data: any,
    tx: any
  ): Promise<{ id: string; isNew: boolean }> {
    // Buscar por CPF (se preenchido)
    if (data.cpf) {
      const existing = await tx
        .select()
        .from(customers)
        .where(eq(customers.cpf, data.cpf))
        .limit(1);

      if (existing.length > 0) {
        return { id: existing[0].id, isNew: false };
      }
    }

    // Buscar por telefone
    if (data.phone) {
      const existing = await tx
        .select()
        .from(customers)
        .where(eq(customers.phone, data.phone))
        .limit(1);

      if (existing.length > 0) {
        return { id: existing[0].id, isNew: false };
      }
    }

    // Criar novo cliente
    const customerId = uuidv4();
    await tx.insert(customers).values({
      id: customerId,
      ...data,
    });

    return { id: customerId, isNew: true };
  }
}
