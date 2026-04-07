import { CustomerRepository } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';

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
    const customer = await customerRepository.findById(id);
    if (!customer) {
      throw new AppError('Cliente não encontrado', 404);
    }

    if (data.cpf && data.cpf !== customer.cpf) {
      const customerExistsByCpf = await customerRepository.findByCpf(data.cpf);
      if (customerExistsByCpf) {
        throw new AppError('Este CPF já está cadastrado para outro cliente', 400);
      }
    }

    if (data.phone && data.phone !== customer.phone) {
      const customerExistsByPhone = await customerRepository.findByPhone(data.phone);
      if (customerExistsByPhone) {
        throw new AppError('Este telefone já está cadastrado para outro cliente', 400);
      }
    }

    // Formatar CPF e CEP antes de atualizar
    const formattedData = {
      ...data,
      cpf: data.cpf ? data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : data.cpf,
      cep: data.cep ? data.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : data.cep,
    };

    return customerRepository.update(id, formattedData);
  }

  async delete(id: string) {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      throw new AppError('Cliente não encontrado', 404);
    }
    await customerRepository.delete(id);
  }
}
