import { CustomerRepository } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/normalizePhone';

const customerRepository = new CustomerRepository();

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

    // Formatar CPF, CEP e normalizar telefone antes de salvar
    const formattedData = {
      ...data,
      phone: normalizePhone(data.phone),
      cpf: data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      cep: (data.cep && data.cep !== '00000000') ? data.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : null,
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
        cep: (data.cep && data.cep !== '00000000') ? data.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : null,
      };

      console.log('[UPDATE CUSTOMER] formattedData para salvar:', JSON.stringify(formattedData));
      const result = await customerRepository.update(id, formattedData);
      console.log('[UPDATE CUSTOMER] sucesso:', JSON.stringify(result));
      return result;
    } catch (error: any) {
      console.error('[UPDATE CUSTOMER] erro:', error);
      if (error instanceof AppError) throw error;
      // Violação de constraint único no MySQL (ER_DUP_ENTRY / errno 1062)
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
