import { Request, Response } from 'express';
import { MessageService } from '../services/message.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { z } from 'zod';

const messageService = new MessageService();
const whatsAppService = new WhatsAppService();

export class MessageController {
  async listConversations(req: Request, res: Response) {
    const conversations = await messageService.listConversations();
    return res.json(conversations);
  }

  async getChatHistory(req: Request, res: Response) {
    const { phone } = req.params;
    const { page, limit } = z.object({
      page: z.string().optional().transform(v => Number(v) || 1),
      limit: z.string().optional().transform(v => Number(v) || 50),
    }).parse(req.query);

    const history = await messageService.getChatHistory(phone, page, limit);
    return res.json({ data: history });
  }

  async sendMessage(req: Request, res: Response) {
    const sendSchema = z.object({
      to: z.string().min(10, 'Número de telefone inválido'),
      content: z.string().min(1, 'Conteúdo da mensagem é obrigatório'),
      customerId: z.string().uuid().optional(),
    });

    const { to, content, customerId } = sendSchema.parse(req.body);
    const result = await messageService.sendMessage(to, content, customerId);

    return res.json(result);
  }

  async updateCRM(req: Request, res: Response) {
    const { id } = req.params;
    const crmSchema = z.object({
      tag: z.enum(['cobrança', 'lead', 'suporte', 'none']),
      notes: z.string().optional(),
    });

    const { tag, notes } = crmSchema.parse(req.body);
    await messageService.updateConversationCRM(id, tag, notes);

    return res.status(204).send();
  }

  async updateConversationTag(req: Request, res: Response) {
    const { phone } = req.params;
    const { tag } = z.object({ tag: z.string().min(1) }).parse(req.body);
    await messageService.updateConversationTag(phone, tag);
    return res.status(204).send();
  }

  async deleteConversation(req: Request, res: Response) {
    const { phone } = req.params;
    await messageService.deleteConversation(phone);
    return res.status(204).send();
  }

  async getStatsToday(req: Request, res: Response) {
    const stats = await messageService.getStatsToday();
    return res.json(stats);
  }

  async proxyMedia(req: Request, res: Response) {
    const { mediaId } = req.params;
    console.log('[proxyMedia] mediaId recebido:', mediaId);

    if (!mediaId || !/^[\w-]+$/.test(mediaId)) {
      console.warn('[proxyMedia] mediaId inválido:', mediaId);
      return res.status(400).json({ error: 'mediaId inválido' });
    }

    try {
      const { buffer, mimeType } = await whatsAppService.downloadMedia(mediaId);
      console.log(`[proxyMedia] ✓ mediaId=${mediaId} mimeType=${mimeType} bytes=${buffer.length}`);
      res.set('Content-Type', mimeType);
      res.set('Cache-Control', 'private, max-age=3600');
      res.set('Content-Length', String(buffer.length));
      return res.send(buffer);
    } catch (err: any) {
      const status = err.response?.status ?? 500;
      const raw    = err.response?.data;
      const detail = raw
        ? Buffer.isBuffer(raw)
          ? raw.toString('utf8').slice(0, 300)
          : raw instanceof ArrayBuffer
            ? new TextDecoder().decode(raw).slice(0, 300)
            : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
        : err.message;
      console.error(`[proxyMedia] ✗ mediaId=${mediaId} status=${status} detail=${detail}`);
      return res.status(502).json({ error: 'Falha ao baixar mídia da Meta', detail });
    }
  }
}
