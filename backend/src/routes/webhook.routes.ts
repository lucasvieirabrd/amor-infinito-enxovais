import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const webhookRouter = Router();
const webhookController = new WebhookController();

// Verificação do webhook pela Meta
webhookRouter.get('/whatsapp', webhookController.verify);

// Recebimento de eventos do WhatsApp
webhookRouter.post('/whatsapp', webhookController.handle);

export { webhookRouter };
