import { Request, Response } from 'express';
import { CustomerService } from '../services/customer.service';
import { z } from 'zod';

const customerService = new CustomerService();

export class CustomerController {
  async register(req: Request, res: Response) {
    const registerSchema = z.object({
      name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
      phone: z.string().min(10, 'Telefone inválido'),
      cpf: z.string().length(14, 'CPF inválido'), // Esperado formato 000.000.000-00
      email: z.string().email('E-mail inválido').optional().or(z.literal('')),
      cep: z.string().length(9, 'CEP inválido').optional().or(z.literal('')),
      addressStreet: z.string().optional().or(z.literal('')),
      addressNeighborhood: z.string().optional().or(z.literal('')),
      addressCity: z.string().optional().or(z.literal('')),
      addressState: z.string().length(2, 'Estado inválido').optional().or(z.literal('')),
    });

    const data = registerSchema.parse(req.body);
    const customer = await customerService.register(data);

    return res.status(201).json(customer);
  }

  async list(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 10),
      search: z.string().optional(),
    });

    const { page, limit, search } = listSchema.parse(req.query);
    const result = await customerService.list(page, limit, search);

    return res.json(result);
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const customer = await customerService.getById(id);
    return res.json(customer);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateSchema = z.object({
      name: z.string().min(3).optional(),
      phone: z.string().min(10).optional(),
      cpf: z.string().length(14).optional(),
      email: z.string().email().optional().or(z.literal('')),
      cep: z.string().length(9).optional().or(z.literal('')),
      addressStreet: z.string().optional().or(z.literal('')),
      addressNeighborhood: z.string().optional().or(z.literal('')),
      addressCity: z.string().optional().or(z.literal('')),
      addressState: z.string().length(2).optional().or(z.literal('')),
    });

    const data = updateSchema.parse(req.body);
    const customer = await customerService.update(id, data);

    return res.json(customer);
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await customerService.delete(id);
    return res.status(204).send();
  }
}
