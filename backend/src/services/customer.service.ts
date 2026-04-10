import { CustomerRepository } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';

const customerRepository = new CustomerRepository();

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
  return digits;
}

export class CustomerService {
  async register(data: any) {
    const customerExistsByCpf = await customerRepository.findByCpf(data.cpf);
    if (customerExistsByCpf) {
      throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
    }

    const customerExistsByPhone = await customerRepository.findByPhone(data.phone);
    if (customerExistsByPhone) {
      throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
    }

    // Formatar CPF e CEP antes de salvar
    const formattedData = {
      ...data,
      cpf: data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      cep: data.cep ? data.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : undefined,
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
      console.log('[UPDATE CUSTOMER] id:', id);
      console.log('[UPDATE CUSTOMER] data recebida:', JSON.stringify(data));

      const customer = await customerRepository.findById(id);
      console.log('[UPDATE CUSTOMER] cliente encontrado:', JSON.stringify(customer));
      if (!customer) {
        throw new AppError('Cliente não encontrado', 404);
      }

      if (data.cpf) {
        const customerExistsByCpf = await customerRepository.findByCpf(data.cpf, id);
        console.log('[UPDATE CUSTOMER] findByCpf resultado:', JSON.stringify(customerExistsByCpf));
        if (customerExistsByCpf) {
          throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
        }
      }

      if (data.phone) {
        const normalizedPhone = normalizePhone(data.phone);
        console.log('[UPDATE CUSTOMER] phone original:', data.phone, '| normalizado:', normalizedPhone);
        const customerExistsByPhone = await customerRepository.findByPhone(normalizedPhone, id);
        console.log('[UPDATE CUSTOMER] findByPhone resultado:', JSON.stringify(customerExistsByPhone));
        if (customerExistsByPhone) {
          throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
        }
        data = { ...data, phone: normalizedPhone };
      }

      // Formatar CPF e CEP antes de atualizar
      const formattedData = {
        ...data,
        cpf: data.cpf ? data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : data.cpf,
        cep: data.cep ? data.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : data.cep,
      };

      console.log('[UPDATE CUSTOMER] formattedData para salvar:', JSON.stringify(formattedData));
      const result = await customerRepository.update(id, formattedData);
      console.log('[UPDATE CUSTOMER] sucesso:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('[UPDATE CUSTOMER] erro:', error);
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
