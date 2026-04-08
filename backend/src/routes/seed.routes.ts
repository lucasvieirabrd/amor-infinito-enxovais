import { Router, Request, Response } from 'express';
import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const seedRouter = Router();

/**
 * GET /seed/health
 * Testa a conexão com o banco de dados
 */
seedRouter.get('/health', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Testando conexão com banco de dados...');
    
    // Tentar uma query simples
    const result = await db.select().from(users).limit(1);
    
    return res.status(200).json({
      status: 'success',
      message: 'Conexão com banco de dados OK',
      database: 'MySQL',
      usersCount: result.length,
    });
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao conectar ao banco de dados',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /seed/init
 * Inicializa o banco de dados criando as tabelas e o usuário admin
 * Apenas para uso inicial - deve ser removido em produção após criar o primeiro admin
 */
seedRouter.post('/init', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Iniciando inicialização do banco de dados...');

    // Criar usuário admin
    console.log('👤 Criando usuário admin...');

    const adminEmail = 'admin@amorinfinito.com';
    const adminPassword = 'AmorInfinito@2026';
    const adminName = 'Lucas';
    const adminRole = 'admin';

    // Verificar se o admin já existe
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (existingAdmin.length > 0) {
      return res.status(409).json({
        status: 'warning',
        message: 'Admin já existe no banco de dados',
        email: adminEmail,
      });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Criar o usuário admin
    const adminId = uuidv4();
    await db.insert(users).values({
      id: adminId,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: adminRole,
    });

    console.log('✅ Usuário admin criado com sucesso!');

    return res.status(201).json({
      status: 'success',
      message: 'Banco de dados inicializado com sucesso',
      admin: {
        id: adminId,
        name: adminName,
        email: adminEmail,
        role: adminRole,
      },
    });
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao inicializar banco de dados',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

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

seedRouter.get("/reset-admin-password", async (req: Request, res: Response) => {
  try {
    const hash = await bcrypt.hash("AmorInfinito@2026", 10);
    await db.update(users).set({ password: hash }).where(eq(users.role, "admin"));
    res.json({ success: true, message: "Senha resetada com sucesso!" });
  } catch (error) {
    res.json({ success: false, error: String(error) });
  }
});
