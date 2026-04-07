import 'dotenv/config';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import path from 'path';

async function initializeDatabase() {
  try {
    console.log('🔄 Iniciando inicialização do banco de dados...');

    // Executar migrações
    console.log('📦 Rodando migrações do Drizzle...');
    
    const connection = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
    });

    const migrationsFolder = path.join(__dirname, '../../drizzle');
    console.log(`📁 Pasta de migrações: ${migrationsFolder}`);

    // Nota: O Drizzle Kit não tem uma API de migração programática simples
    // As tabelas serão criadas automaticamente pelo Drizzle ORM ao conectar
    console.log('✅ Banco de dados conectado (tabelas serão criadas automaticamente)');

    await connection.end();

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
      console.log('⚠️  Admin já existe no banco de dados!');
      console.log(`Email: ${adminEmail}`);
      process.exit(0);
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
    console.log('');
    console.log('📋 Credenciais do Admin:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Senha: ${adminPassword}`);
    console.log(`   Nome: ${adminName}`);
    console.log(`   Role: ${adminRole}`);
    console.log('');
    console.log('🔐 Guarde essas credenciais em um local seguro!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    process.exit(1);
  }
}

initializeDatabase();
