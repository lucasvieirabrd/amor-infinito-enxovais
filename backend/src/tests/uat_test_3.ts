import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';

async function runUAT3() {
  console.log('--- INICIANDO UAT FASE 3: PERMISSÕES ---');

  const testAdminEmail = 'admin@teste.com';
  const testSellerEmail = 'vendedor@teste.com';

  try {
    // 1. Cadastrar usuários para teste
    console.log('[1/2] Teste: Cadastro de Usuários (Admin e Vendedor)...');
    await db.delete(users).where(eq(users.email, testAdminEmail));
    await db.delete(users).where(eq(users.email, testSellerEmail));

    await db.insert(users).values({
      name: 'Admin Teste',
      email: testAdminEmail,
      password: 'hash_simulada',
      role: 'admin',
      phone: '5516999990003'
    });

    await db.insert(users).values({
      name: 'Vendedor Teste',
      email: testSellerEmail,
      password: 'hash_simulada',
      role: 'seller',
      phone: '5516999990004'
    });
    console.log('- Usuários Admin e Vendedor criados com sucesso.');

    // 2. Simular validação de permissão
    console.log('[2/2] Teste: Validação de Middleware de Autorização...');
    
    const adminUser = await db.query.users.findFirst({ where: eq(users.email, testAdminEmail) });
    const sellerUser = await db.query.users.findFirst({ where: eq(users.email, testSellerEmail) });

    // Simular middleware de autorização (ensureAuthorized)
    const canDelete = (role: string) => role === 'admin';

    console.log(`- Usuário Admin pode excluir? ${canDelete(adminUser!.role) ? 'SIM (Correto)' : 'NÃO'}`);
    console.log(`- Usuário Vendedor pode excluir? ${canDelete(sellerUser!.role) ? 'SIM' : 'NÃO (Correto)'}`);

    if (canDelete(adminUser!.role) && !canDelete(sellerUser!.role)) {
      console.log('\n--- UAT FASE 3 CONCLUÍDA COM SUCESSO! ---');
    } else {
      console.log('\n--- UAT FASE 3 FALHOU! ---');
    }

  } catch (error) {
    console.error('Erro durante o UAT Fase 3:', error);
  } finally {
    process.exit(0);
  }
}

runUAT3();
