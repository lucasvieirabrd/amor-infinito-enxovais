import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const billingRouter = Router();
const billingController = new BillingController();

// Rota temporária de teste — sem autenticação para facilitar validação manual
billingRouter.get('/relatorio/test-send', billingController.testSendPdfReport);

billingRouter.use(ensureAuthenticated);

billingRouter.get('/charges-preview', billingController.getChargesPreview);
billingRouter.post('/send-charges', billingController.sendCharges);
billingRouter.get('/messages', billingController.getBillingMessages);
billingRouter.get('/relatorio/pdf', billingController.getRelatorioPdf);

export { billingRouter };
