import { Request, Response } from 'express';
import { MessageRepository } from '../repositories/message.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { notifyNewMessage } from '../websocket';
import { normalizePhone } from '../utils/normalizePhone';
import { db } from '../database';
import { settings } from '../database/schema';
import { inArray } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const messageRepository = new MessageRepository();
const customerRepository = new CustomerRepository();
const whatsAppService = new WhatsAppService();

// ─── PIX intent detection ─────────────────────────────────────────────────────

const PIX_KEYWORDS = [
  'pix', 'chave', 'pagar', 'pagamento', 'como pago',
  'quero pagar', 'me manda', 'passa o pix', 'chave pix',
];

function hasPIXIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return PIX_KEYWORDS.some(kw =>
    normalized.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );
}

// ─── Controller ───────────────────────────────────────────────────────────────

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

    if (process.env.NODE_ENV === 'development') {
      console.log('[WEBHOOK] payload completo:', JSON.stringify(body, null, 2));
    }

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // 1. Processar Mensagens Recebidas (Inbound)
      if (value?.messages) {
        const msg = value.messages[0];
        const contact = value.contacts?.[0];
        const phone = normalizePhone(msg.from);

        // Tentar vincular ao cliente pelo número de telefone
        const customer = await customerRepository.findByPhone(phone);

        const ALLOWED_TYPES = ['text', 'template', 'image', 'audio', 'video', 'document', 'unknown', 'unsupported', 'sticker'];

        // Extract media id and filename per message type
        const mediaObj: Record<string, any> = {
          image: msg.image, audio: msg.audio, video: msg.video,
          document: msg.document, sticker: msg.sticker,
        };
        const mediaPayload = mediaObj[msg.type] ?? null;
        const mediaId: string | null = mediaPayload?.id ?? null;
        const mediaFilename: string | null = msg.document?.filename ?? null;
        const content: string | null =
          msg.text?.body
          ?? msg.image?.caption
          ?? msg.video?.caption
          ?? msg.document?.caption
          ?? null;

        const messageData = {
          metaMessageId: msg.id,
          customerId: customer?.id || null,
          fromPhone: phone,
          toPhone: 'SISTEMA',
          type: ALLOWED_TYPES.includes(msg.type) ? msg.type : 'unsupported',
          content,
          mediaId,
          mediaFilename,
          direction: 'inbound',
          status: 'received',
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
        };

        const id = await messageRepository.create(messageData);

        // Notificar frontend via WebSocket em tempo real
        notifyNewMessage(phone, { id, ...messageData, customerName: customer?.name || contact?.profile?.name });

        console.log(`[WEBHOOK] Mensagem recebida de ${phone}: ${msg.text?.body}`);

        // 2. Auto-resposta PIX (somente mensagens de texto inbound)
        if (msg.type === 'text' && hasPIXIntent(content)) {
          try {
            const pixRows = await db
              .select({ key: settings.key, value: settings.value })
              .from(settings)
              .where(inArray(settings.key, ['pix_celita', 'pix_marcelo']));

            const pixCelita  = pixRows.find(r => r.key === 'pix_celita')?.value  ?? '';
            const pixMarcelo = pixRows.find(r => r.key === 'pix_marcelo')?.value ?? '';

            if (pixCelita || pixMarcelo) {
              const lines = ['Olá! Segue nossas chaves PIX para pagamento:', ''];
              if (pixCelita)  lines.push(`PIX CELITA: ${pixCelita}`);
              if (pixMarcelo) lines.push(`PIX MARCELO: ${pixMarcelo}`);
              lines.push('👤 Beneficiário: Amor Infinito Enxovais', '');
              lines.push('Após o pagamento, nos envie o comprovante 😊');
              const pixText = lines.join('\n');

              const result = await whatsAppService.sendTextMessage(phone, pixText);

              if (result && !result.error) {
                const autoId = await messageRepository.create({
                  metaMessageId: result.messages?.[0]?.id,
                  customerId: customer?.id || null,
                  fromPhone: 'SISTEMA',
                  toPhone: phone,
                  type: 'text',
                  content: pixText,
                  direction: 'outbound',
                  status: 'sent',
                  timestamp: new Date(),
                });

                notifyNewMessage(phone, {
                  id: autoId,
                  metaMessageId: result.messages?.[0]?.id,
                  customerId: customer?.id || null,
                  fromPhone: 'SISTEMA',
                  toPhone: phone,
                  type: 'text',
                  content: pixText,
                  direction: 'outbound',
                  status: 'sent',
                  timestamp: new Date(),
                  customerName: customer?.name || contact?.profile?.name,
                });

                console.log(`[WEBHOOK] Auto-resposta PIX enviada para ${phone}`);
              } else {
                console.error(`[WEBHOOK] Falha ao enviar auto-resposta PIX para ${phone}:`, result?.message);
              }
            } else {
              console.warn('[WEBHOOK] Auto-resposta PIX ignorada: nenhuma chave PIX cadastrada nas settings');
            }
          } catch (err: any) {
            console.error('[WEBHOOK] Erro na auto-resposta PIX:', err.message);
          }
        }
      }

      // 3. Processar Status de Mensagens Enviadas (Outbound)
      if (value?.statuses) {
        const statusMsg = value.statuses[0];
        const metaMessageId = statusMsg.id;
        const status = statusMsg.status; // 'sent', 'delivered', 'read', 'failed'

        let errorCode: string | undefined;
        let errorMessage: string | undefined;

        if (status === 'failed' && statusMsg.errors?.length) {
          console.log('[WEBHOOK FAILED]', JSON.stringify(statusMsg.errors));
          errorCode = String(statusMsg.errors[0].code ?? '');
          errorMessage = statusMsg.errors[0].title ?? statusMsg.errors[0].message ?? '';
        }

        await messageRepository.updateStatus(metaMessageId, status, errorCode, errorMessage);
        console.log(`[WEBHOOK] Status da mensagem ${metaMessageId} atualizado para ${status}`);
      }

      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(404).send();
  }
}
