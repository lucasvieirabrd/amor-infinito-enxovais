import { Router, Request, Response } from 'express';
import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const seedRouter = Router();

/**
 * POST /seed/create-admin
 * Cria um usuário admin com as credenciais fornecidas
 * Apenas para uso inicial - deve ser removido em produção após criar o primeiro admin
 */
seedRouter.post('/create-admin', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    // Validar entrada
    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Nome, email e senha são obrigatórios',
      });
    }

    // Verificar se o usuário já existe
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Este e-mail já está em uso',
      });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar o usuário
    const userId = uuidv4();
    await db.insert(users).values({
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: role || 'admin',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Usuário criado com sucesso',
      user: {
        id: userId,
        name,
        email,
        role: role || 'admin',
      },
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao criar usuário',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export { seedRouter };
