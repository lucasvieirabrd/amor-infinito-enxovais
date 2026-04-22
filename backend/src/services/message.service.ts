import { MessageRepository } from '../repositories/message.repository';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/normalizePhone';

const messageRepository = new MessageRepository();
const whatsAppService = new WhatsAppService();

export class MessageService {
  async listConversations() {
    return messageRepository.listConversations();
  }

  async getChatHistory(phone: string, page = 1, limit = 50) {
    return messageRepository.listChatHistory(phone, page, limit);
  }

  async sendMessage(to: string, content: string, customerId?: string) {
    const normalizedTo = normalizePhone(to);
    const result = await whatsAppService.sendTextMessage(normalizedTo, content);

    if (result && !result.error) {
      const id = await messageRepository.create({
        metaMessageId: result.messages?.[0]?.id,
        customerId: customerId || null,
        fromPhone: 'SISTEMA',
        toPhone: normalizedTo,
        type: 'text',
        content,
        direction: 'outbound',
        status: 'sent',
        timestamp: new Date(),
      });
      return { id, ...result };
    } else {
      throw new AppError('Falha ao enviar mensagem pelo WhatsApp', 502);
    }
  }

  async updateConversationCRM(messageId: string, tag: 'cobrança' | 'lead' | 'suporte' | 'none', notes?: string) {
    return messageRepository.updateTagAndNotes(messageId, tag, notes);
  }

  async updateConversationTag(phone: string, tag: string) {
    return messageRepository.upsertConversationTag(phone, tag);
  }

  async deleteConversation(phone: string) {
    return messageRepository.deleteConversationMessages(phone);
  }

  async getStatsToday() {
    return messageRepository.getStatsToday();
  }
}
