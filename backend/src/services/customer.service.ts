import { CustomerRepository } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/normalizePhone';
import { db } from '../database';
import { auditLogs } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

const customerRepository = new CustomerRepository();

function formatCpf(digits: string): string {
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCep(digits: string): string {
  return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export class CustomerService {
  async register(data: any) {
    const formattedCpf = formatCpf(data.cpf);

    const customerExistsByCpf = await customerRepository.findByCpf(formattedCpf);
    if (customerExistsByCpf) {
      throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
    }

    const customerExistsByPhone = await customerRepository.findByPhone(data.phone);
    if (customerExistsByPhone) {
      throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
    }

    const formattedData = {
      ...data,
      phone: normalizePhone(data.phone),
      cpf: formattedCpf,
      cep: (data.cep && data.cep !== '00000000') ? formatCep(data.cep) : null,
    };

    const customer = await customerRepository.create(formattedData);

    if (!customer) {
      throw new AppError('Erro ao cadastrar cliente', 500);
    }

    return customer;
  }

  async list(page = 1, limit = 10, search?: string) {
    return customerRepository.list(page, limit, search);
  }

  async getById(id: string) {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      throw new AppError('Cliente não encontrado', 404);
    }
    return customer;
  }

  async update(id: string, data: any) {
    try {
      const customer = await customerRepository.findById(id);
      if (!customer) {
        throw new AppError('Cliente não encontrado', 404);
      }

      if (data.cpf) {
        const formattedCpf = formatCpf(data.cpf);
        const customerExistsByCpf = await customerRepository.findByCpf(formattedCpf, id);
        if (customerExistsByCpf) {
          throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
        }
        data = { ...data, cpf: formattedCpf };
      }

      if (data.phone) {
        const normalizedPhone = normalizePhone(data.phone);
        const customerExistsByPhone = await customerRepository.findByPhone(normalizedPhone, id);
        if (customerExistsByPhone) {
          throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
        }
        data = { ...data, phone: normalizedPhone };
      }

      if (data.cep !== undefined) {
        data = {
          ...data,
          cep: (data.cep && data.cep !== '00000000') ? formatCep(data.cep) : null,
        };
      }

      const result = await customerRepository.update(id, data);
      return result;
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
        const msg = error?.message ?? '';
        if (msg.includes('phone')) {
          throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
        }
        if (msg.includes('cpf')) {
          throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
        }
        throw new AppError('Dado duplicado — verifique CPF e telefone', 400);
      }
      throw error;
    }
  }

  async delete(id: string) {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      throw new AppError('Cliente não encontrado', 404);
    }
    await customerRepository.delete(id);
  }

  async getMergePreview(primaryId: string, duplicateId: string) {
    if (primaryId === duplicateId) {
      throw new AppError('Não é possível mesclar um cliente com ele mesmo', 400);
    }
    const primary = await customerRepository.findById(primaryId);
    if (!primary) throw new AppError('Cliente principal não encontrado', 404);

    const duplicate = await customerRepository.findById(duplicateId);
    if (!duplicate) throw new AppError('Cliente duplicado não encontrado', 404);

    return customerRepository.countMergeableRecords(duplicateId);
  }

  async mergeCustomers(primaryId: string, duplicateId: string, mergedData: any, userId: string) {
    if (primaryId === duplicateId) {
      throw new AppError('Não é possível mesclar um cliente com ele mesmo', 400);
    }

    const primary = await customerRepository.findById(primaryId);
    if (!primary) throw new AppError('Cliente principal não encontrado', 404);

    const duplicate = await customerRepository.findById(duplicateId);
    if (!duplicate) throw new AppError('Cliente duplicado não encontrado', 404);

    const counts = await customerRepository.countMergeableRecords(duplicateId);

    // phone comes from customer record already normalized; pass it through
    await customerRepository.mergeCustomers(primaryId, duplicateId, mergedData);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'MERGE_CUSTOMERS',
      entityType: 'Customer',
      entityId: primaryId,
      oldValue: { duplicateId, duplicateName: duplicate.name },
      newValue: mergedData,
    });

    return {
      primaryId,
      installments: counts.installments,
      sales: counts.sales,
      messages: counts.messages,
    };
  }
}
