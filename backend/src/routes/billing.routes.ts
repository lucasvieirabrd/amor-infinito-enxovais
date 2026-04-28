import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const billingRouter = Router();
const billingController = new BillingController();

billingRouter.use(ensureAuthenticated);

billingRouter.get('/charges-preview', billingController.getChargesPreview);
billingRouter.post('/send-charges', billingController.sendCharges);
billingRouter.get('/messages', billingController.getBillingMessages);
billingRouter.get('/relatorio/pdf', billingController.getRelatorioPdf);
billingRouter.get('/relatorio/test-send', billingController.testSendPdfReport);

export { billingRouter };
