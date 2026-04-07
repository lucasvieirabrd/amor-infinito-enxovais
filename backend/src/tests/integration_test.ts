import { CustomerRepository } from '../repositories/customer.repository';
import { MessageRepository } from '../repositories/message.repository';
import { MessageService } from '../services/message.service';
import { db } from '../database';
import { customers, messages } from '../database/schema';
import { eq } from 'drizzle-orm';

const customerRepo = new CustomerRepository();
const messageRepo = new MessageRepository();
const messageService = new MessageService();

interface Conversation {
  id: string;
  fromPhone: string;
  customerName?: string;
  tag: string;
}

async function runTest() {
  console.log('--- INICIANDO TESTES DE INTEGRAÇÃO: MENSAGENS <-> CRM ---');

  const testPhone = '5516996312685';
  const testName = 'Cliente Teste Integração';

  try {
    // 1. Limpar dados de teste anteriores
    console.log('[1/4] Limpando dados de teste anteriores...');
    await db.delete(messages).where(eq(messages.fromPhone, testPhone));
    await db.delete(customers).where(eq(customers.phone, testPhone));

    // 2. Simular recebimento de mensagem de um número NÃO cadastrado
    console.log('[2/4] Simulando mensagem de número novo (NÃO cadastrado)...');
    await messageRepo.create({
      metaMessageId: 'test_meta_id_1',
      fromPhone: testPhone,
      toPhone: 'SISTEMA',
      content: 'Olá, gostaria de saber sobre enxovais!',
      direction: 'inbound',
      status: 'received',
      type: 'text',
      timestamp: new Date()
    });

    // Validar se a conversa aparece na lista (sem nome de cliente)
    const conversationsBefore = await messageService.listConversations() as unknown as Conversation[];
    const convBefore = conversationsBefore.find(c => c.fromPhone === testPhone);
    console.log(`- Conversa encontrada? ${!!convBefore}`);
    console.log(`- Nome do cliente vinculado? ${convBefore?.customerName || 'Nenhum (Correto)'}`);

    // 3. Cadastrar o cliente no CRM com o mesmo número
    console.log('[3/4] Cadastrando cliente no CRM...');
    await customerRepo.create({
      name: testName,
      cpf: '000.000.000-00',
      phone: testPhone,
      email: 'teste@email.com'
    });

    // 4. Validar vínculo automático no chat
    console.log('[4/4] Validando vínculo automático no chat...');
    const conversationsAfter = await messageService.listConversations() as unknown as Conversation[];
    const convAfter = conversationsAfter.find(c => c.fromPhone === testPhone);
    console.log(`- Conversa encontrada? ${!!convAfter}`);
    console.log(`- Nome do cliente vinculado? ${convAfter?.customerName || 'Nenhum'} (Esperado: ${testName})`);

    // 5. Testar atualização de Tag CRM no chat
    console.log('[5/5] Testando atualização de Tag CRM...');
    if (convAfter) {
      await messageService.updateConversationCRM(convAfter.id, 'lead', 'Interesse em lençóis');
      const updatedConversations = await messageService.listConversations() as unknown as Conversation[];
      const updatedConv = updatedConversations.find(c => c.id === convAfter.id);
      console.log(`- Tag atualizada para: ${updatedConv?.tag}`);
    }

    if (convAfter?.customerName === testName) {
      console.log('\n--- RESULTADO: TESTE DE INTEGRAÇÃO PASSOU COM SUCESSO! ---');
    } else {
      console.log('\n--- RESULTADO: TESTE DE INTEGRAÇÃO FALHOU! ---');
    }

  } catch (error) {
    console.error('Erro durante o teste:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
