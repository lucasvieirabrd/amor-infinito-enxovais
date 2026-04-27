import { CustomerRepository } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/normalizePhone';

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
}
