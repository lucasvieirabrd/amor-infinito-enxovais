import 'dotenv/config';
import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function seedAdmin() {
  try {
    console.log('🌱 Iniciando seed do usuário admin...');

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
    console.error('❌ Erro ao criar usuário admin:', error);
    process.exit(1);
  }
}

seedAdmin();
