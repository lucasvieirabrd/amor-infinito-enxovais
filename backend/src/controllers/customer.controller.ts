import { Request, Response } from 'express';
import { CustomerService } from '../services/customer.service';
import { CustomerImportService } from '../services/customer-import.service';
import { z } from 'zod';

const customerService = new CustomerService();
const customerImportService = new CustomerImportService();

function sanitizeNumeric(value: string): string {
  return value.replace(/\D/g, '');
}

export class CustomerController {
  async register(req: Request, res: Response) {
    const raw = req.body;
    const body = {
      ...raw,
      cpf: raw.cpf ? sanitizeNumeric(raw.cpf) : raw.cpf,
      phone: raw.phone ? sanitizeNumeric(raw.phone) : raw.phone,
      cep: raw.cep ? sanitizeNumeric(raw.cep) : raw.cep,
    };

    const registerSchema = z.object({
      name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
      phone: z.string().min(10, 'Telefone inválido').max(11, 'Telefone inválido'),
      cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
      email: z.string().email('E-mail inválido').optional().or(z.literal('')),
      cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos').optional().or(z.literal('')),
      addressStreet: z.string().optional().or(z.literal('')),
      addressNumber: z.string().optional().or(z.literal('')),
      addressComplement: z.string().optional().or(z.literal('')),
      addressNeighborhood: z.string().optional().or(z.literal('')),
      addressCity: z.string().optional().or(z.literal('')),
      addressState: z.string().length(2, 'Estado inválido').optional().or(z.literal('')),
      ref1Name: z.string().optional().or(z.literal('')),
      ref1Phone: z.string().optional().or(z.literal('')),
      ref1Relationship: z.string().optional().or(z.literal('')),
      ref2Name: z.string().optional().or(z.literal('')),
      ref2Phone: z.string().optional().or(z.literal('')),
      ref2Relationship: z.string().optional().or(z.literal('')),
      ref3Name: z.string().optional().or(z.literal('')),
      ref3Phone: z.string().optional().or(z.literal('')),
      ref3Relationship: z.string().optional().or(z.literal('')),
    });

    const data = registerSchema.parse(body);
    const customer = await customerService.register(data);

    return res.status(201).json(customer);
  }

  async list(req: Request, res: Response) {
    const listSchema = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 10),
      search: z.string().optional(),
      statusFilter: z.enum(['devendo', 'quitado', 'sem_crediario', 'sem_compras']).optional(),
    });

    const { page, limit, search, statusFilter } = listSchema.parse(req.query);
    const result = await customerService.list(page, limit, search, statusFilter);

    return res.json(result);
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const customer = await customerService.getById(id);
    return res.json(customer);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const raw = req.body;
    const body = {
      ...raw,
      cpf: raw.cpf ? sanitizeNumeric(raw.cpf) : raw.cpf,
      phone: raw.phone ? sanitizeNumeric(raw.phone) : raw.phone,
      cep: raw.cep ? sanitizeNumeric(raw.cep) : raw.cep,
    };

    const updateSchema = z.object({
      name: z.string().min(3).optional(),
      phone: z.string().min(10).max(11).optional(),
      cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos').optional(),
      email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
      cep: z.union([z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos'), z.literal(''), z.null()]).optional(),
      addressStreet: z.string().nullable().optional(),
      addressNumber: z.string().nullable().optional(),
      addressComplement: z.string().nullable().optional(),
      addressNeighborhood: z.string().nullable().optional(),
      addressCity: z.string().nullable().optional(),
      addressState: z.union([z.string().length(2), z.literal(''), z.null()]).optional(),
      ref1Name: z.string().nullable().optional(),
      ref1Phone: z.string().nullable().optional(),
      ref1Relationship: z.string().nullable().optional(),
      ref2Name: z.string().nullable().optional(),
      ref2Phone: z.string().nullable().optional(),
      ref2Relationship: z.string().nullable().optional(),
      ref3Name: z.string().nullable().optional(),
      ref3Phone: z.string().nullable().optional(),
      ref3Relationship: z.string().nullable().optional(),
    });

    const data = updateSchema.parse(body);
    const customer = await customerService.update(id, data);

    return res.json(customer);
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await customerService.delete(id);
    return res.status(204).send();
  }

  async importCSV(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não fornecido' });
    }

    const result = await customerImportService.importFromCSV(req.file.buffer);
    return res.json(result);
  }

  async uploadPhoto(req: Request, res: Response) {
    const { id } = req.params;
    if (!req.file) {
      res.status(400).json({ message: 'Nenhum arquivo enviado.' });
      return;
    }
    await customerService.uploadPhoto(id, req.user!.id, req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ message: 'Foto anexada com sucesso.' });
  }

  async getPhoto(req: Request, res: Response) {
    const { id } = req.params;
    const photo = await customerService.getPhoto(id);
    res.setHeader('Content-Type', photo.mimetype);
    res.setHeader('Content-Length', String(photo.size));
    res.send(photo.buffer);
  }

  async deletePhoto(req: Request, res: Response) {
    const { id } = req.params;
    await customerService.deletePhoto(id, req.user!.id);
    res.status(204).send();
  }

  async getMergePreview(req: Request, res: Response) {
    const { primaryId, duplicateId } = req.params;
    const result = await customerService.getMergePreview(primaryId, duplicateId);
    return res.json(result);
  }

  async merge(req: Request, res: Response) {
    const mergeSchema = z.object({
      primaryCustomerId: z.string(),
      duplicateCustomerId: z.string(),
      mergedData: z.object({
        name: z.string().min(1),
        cpf: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        cep: z.string().optional().nullable(),
        addressStreet: z.string().optional().nullable(),
        addressNumber: z.string().optional().nullable(),
        addressNeighborhood: z.string().optional().nullable(),
        addressCity: z.string().optional().nullable(),
        addressState: z.string().optional().nullable(),
      }),
    });

    const { primaryCustomerId, duplicateCustomerId, mergedData } = mergeSchema.parse(req.body);
    const userId = (req as any).user!.id;

    const result = await customerService.mergeCustomers(
      primaryCustomerId,
      duplicateCustomerId,
      mergedData,
      userId,
    );
    return res.json(result);
  }
}
