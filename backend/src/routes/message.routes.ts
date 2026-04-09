import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const messageRouter = Router();
const messageController = new MessageController();

// Todas as rotas de mensagens requerem autenticação
messageRouter.use(ensureAuthenticated);

// Listar conversas ativas
messageRouter.get('/conversations', messageController.listConversations);

// Estatísticas do dia
messageRouter.get('/stats/today', messageController.getStatsToday);

// Histórico de chat por telefone
messageRouter.get('/history/:phone', messageController.getChatHistory);

// Enviar mensagem manual (estilo chat)
messageRouter.post('/send', messageController.sendMessage);

// Atualizar tag/notas de CRM (legado, por id de mensagem)
messageRouter.patch('/:id/crm', messageController.updateCRM);

// Atualizar tag da conversa por telefone
messageRouter.put('/conversations/:phone/tag', messageController.updateConversationTag);

// Excluir conversa e suas mensagens
messageRouter.delete('/conversations/:phone', messageController.deleteConversation);

export { messageRouter };
