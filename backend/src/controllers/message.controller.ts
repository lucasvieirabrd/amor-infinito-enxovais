import { Request, Response } from 'express';
import { MessageService } from '../services/message.service';
import { z } from 'zod';

const messageService = new MessageService();

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
}
