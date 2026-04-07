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
 * POST /seed/migrate
 * Cria as tabelas do banco de dados
 * Apenas para uso inicial - deve ser removido em produção após criar as tabelas
 */
seedRouter.post('/migrate', async (req: Request, res: Response) => {
  try {
    console.log('📦 Criando tabelas do banco de dados...');
    
    // Obter conexão raw do MySQL
    const connection = (db as any)._.client;
    
    // Criar tabelas
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'seller') NOT NULL DEFAULT 'seller',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        KEY idx_email (email),
        KEY idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        cpf VARCHAR(14) NOT NULL UNIQUE,
        email VARCHAR(255),
        cep VARCHAR(9),
        address_street VARCHAR(255),
        address_neighborhood VARCHAR(255),
        address_city VARCHAR(255),
        address_state VARCHAR(2),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        KEY idx_phone (phone),
        KEY idx_cpf (cpf)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(50) UNIQUE,
        quantity INT NOT NULL DEFAULT 0,
        price DECIMAL(10, 2) NOT NULL,
        min_stock_level INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        KEY idx_sku (sku)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      
      CREATE TABLE IF NOT EXISTS sales (
        id VARCHAR(36) PRIMARY KEY,
        sale_number VARCHAR(20) NOT NULL UNIQUE,
        customer_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        payment_method ENUM('cash', 'credit_card', 'installment') NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        final_amount DECIMAL(10, 2) NOT NULL,
        status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        KEY idx_customer_id (customer_id),
        KEY idx_user_id (user_id),
        KEY idx_status (status),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      
      CREATE TABLE IF NOT EXISTS sale_items (
        id VARCHAR(36) PRIMARY KEY,
        sale_id VARCHAR(36) NOT NULL,
        product_id VARCHAR(36) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_sale_id (sale_id),
        KEY idx_product_id (product_id),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      
      CREATE TABLE IF NOT EXISTS installments (
        id VARCHAR(36) PRIMARY KEY,
        sale_id VARCHAR(36) NOT NULL,
        installment_number INT NOT NULL,
        total_installments INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        due_date DATE NOT NULL,
        paid_date DATE,
        status ENUM('pending', 'paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_sale_id (sale_id),
        KEY idx_status (status),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    // Executar cada comando SQL separadamente
    const statements = createTablesSQL.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement + ';');
      }
    }
    
    console.log('✅ Tabelas criadas com sucesso!');
    
    return res.status(201).json({
      status: 'success',
      message: 'Tabelas criadas com sucesso',
      tables: ['users', 'customers', 'products', 'sales', 'sale_items', 'installments'],
    });
  } catch (error) {
    console.error('Erro ao criar tabelas:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao criar tabelas',
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
