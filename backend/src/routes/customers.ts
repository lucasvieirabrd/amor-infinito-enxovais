import express, { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { Customer } from '../models/Customer';
import { AppError } from '../utils/AppError';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Middleware de autenticação
router.use(authenticate);

// GET /customers - Listar clientes
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const query = search ? { name: { $regex: search, $options: 'i' } } : {};
    const customers = await Customer.find(query).limit(50);
    res.json({ data: customers });
  } catch (error) {
    throw new AppError('Erro ao listar clientes', 500);
  }
});

// POST /customers - Criar novo cliente
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, cpf, phone, email, addressStreet, addressNeighborhood, addressCity, addressState, cep } = req.body;

    if (!name || !cpf || !phone) {
      throw new AppError('Nome, CPF e telefone são obrigatórios', 400);
    }

    const newCustomer = new Customer({
      name,
      cpf,
      phone,
      email,
      addressStreet,
      addressNeighborhood,
      addressCity,
      addressState,
      cep,
    });

    await newCustomer.save();
    res.status(201).json({ data: newCustomer });
  } catch (error: any) {
    throw new AppError(error.message || 'Erro ao criar cliente', 500);
  }
});

// POST /customers/import-csv - Importar clientes via CSV
router.post('/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('Nenhum arquivo foi enviado', 400);
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const record = records[i];
        const { name, cpf, phone, email, addressStreet, addressNeighborhood, addressCity, addressState, cep } = record;

        if (!name || !cpf || !phone) {
          errors.push(`Linha ${i + 2}: Nome, CPF e telefone são obrigatórios`);
          failed++;
          continue;
        }

        const newCustomer = new Customer({
          name,
          cpf,
          phone,
          email,
          addressStreet,
          addressNeighborhood,
          addressCity,
          addressState,
          cep,
        });

        await newCustomer.save();
        success++;
      } catch (error: any) {
        errors.push(`Linha ${i + 2}: ${error.message}`);
        failed++;
      }
    }

    // Limpar arquivo temporário
    fs.unlinkSync(req.file.path);

    res.json({
      success,
      failed,
      errors,
    });
  } catch (error: any) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    throw new AppError(error.message || 'Erro ao importar CSV', 500);
  }
});

export default router;
