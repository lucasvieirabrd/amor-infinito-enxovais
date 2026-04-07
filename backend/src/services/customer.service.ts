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

    const customer = await customerRepository.create(data);

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

    return customerRepository.update(id, data);
  }

  async delete(id: string) {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      throw new AppError('Cliente não encontrado', 404);
    }
    await customerRepository.delete(id);
  }
}
