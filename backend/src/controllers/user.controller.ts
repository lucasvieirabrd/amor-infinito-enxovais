import { Request, Response } from 'express';
import { z } from 'zod';
import { UserService } from '../services/user.service';

const userService = new UserService();

const TAB_KEYS = [
  'dashboard', 'clientes', 'produtos', 'vendas',
  'crediario', 'cobranca', 'mensagens', 'entregas', 'contas_a_pagar',
] as const;

const userCreateSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  role: z.enum(['admin', 'seller']).default('seller'),
  allowedTabs: z.array(z.enum(TAB_KEYS)).optional(),
});

const userUpdateSchema = z.object({
  name: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'seller']).optional(),
  allowedTabs: z.array(z.enum(TAB_KEYS)).optional(),
});

export class UserController {
  async list(req: Request, res: Response) {
    const users = await userService.listUsers();
    return res.json(users);
  }

  async create(req: Request, res: Response) {
    const data = userCreateSchema.parse(req.body);
    const user = await userService.createUser({
      name: data.name!,
      email: data.email!,
      password: data.password!,
      role: data.role ?? 'seller',
      allowedTabs: data.allowedTabs as string[] | undefined,
    });
    return res.status(201).json(user);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = userUpdateSchema.parse(req.body);
    const user = await userService.updateUser(id, data);
    return res.json(user);
  }

  async toggleActive(req: Request, res: Response) {
    const { id } = req.params;
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const user = await userService.toggleActive(id, active);
    return res.json(user);
  }
}
