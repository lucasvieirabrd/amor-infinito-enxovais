import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { z } from 'zod';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response) {
    const registerSchema = z.object({
      name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
      email: z.string().email('E-mail inválido'),
      password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
      role: z.enum(['admin', 'seller']).optional(),
    });

    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);

    return res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const loginSchema = z.object({
      email: z.string().email('E-mail inválido'),
      password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    });

    const data = loginSchema.parse(req.body);
    const { user, token } = await authService.login(data);

    return res.json({ user, token });
  }

  async logout(req: Request, res: Response) {
    return res.status(204).send();
  }

  async me(req: Request, res: Response) {
    // req.user será preenchido pelo middleware de autenticação
    return res.json(req.user);
  }
}
