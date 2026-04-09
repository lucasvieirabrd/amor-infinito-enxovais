import { Request, Response } from 'express';
import { MessageRepository } from '../repositories/message.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { notifyNewMessage } from '../websocket';
import dotenv from 'dotenv';

dotenv.config();

const messageRepository = new MessageRepository();
const customerRepository = new CustomerRepository();

export class WebhookController {
  /**
   * Verificação do Webhook pela Meta (Challenge).
   */
  async verify(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        console.log('[WEBHOOK] Verificação concluída com sucesso.');
        return res.status(200).send(challenge);
      } else {
        return res.status(403).send('Token de verificação inválido');
      }
    }
    return res.status(400).send('Parâmetros inválidos');
  }

  /**
   * Recebimento de eventos do WhatsApp (Mensagens e Status).
   */
  async handle(req: Request, res: Response) {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // 1. Processar Mensagens Recebidas (Inbound)
      if (value?.messages) {
        const msg = value.messages[0];
        const contact = value.contacts?.[0];
        const phone = msg.from;

        // Tentar vincular ao cliente pelo número de telefone
        const customer = await customerRepository.findByPhone(phone);
        
        const ALLOWED_TYPES = ['text', 'template', 'image', 'audio', 'video', 'document', 'unknown', 'unsupported'];
        const messageData = {
          metaMessageId: msg.id,
          customerId: customer?.id || null,
          fromPhone: phone,
          toPhone: 'SISTEMA',
          type: ALLOWED_TYPES.includes(msg.type) ? msg.type : 'unsupported',
          content: msg.text?.body || msg.image?.caption || msg.audio?.id || 'Conteúdo não suportado',
          direction: 'inbound',
          status: 'received',
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
        };

        const id = await messageRepository.create(messageData);

        // Notificar frontend via WebSocket em tempo real
        notifyNewMessage(phone, { id, ...messageData, customerName: customer?.name || contact?.profile?.name });
        
        console.log(`[WEBHOOK] Mensagem recebida de ${phone}: ${msg.text?.body}`);
      }

      // 2. Processar Status de Mensagens Enviadas (Outbound)
      if (value?.statuses) {
        const statusMsg = value.statuses[0];
        const metaMessageId = statusMsg.id;
        const status = statusMsg.status; // 'sent', 'delivered', 'read', 'failed'

        await messageRepository.updateStatus(metaMessageId, status);
        console.log(`[WEBHOOK] Status da mensagem ${metaMessageId} atualizado para ${status}`);
      }

      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(404).send();
  }
}
