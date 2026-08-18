import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureTabAccess } from '../middlewares/ensureTabAccess';

const billingRouter = Router();
const billingController = new BillingController();

billingRouter.use(ensureAuthenticated);
billingRouter.use(ensureTabAccess('cobranca'));

billingRouter.get('/charges-preview', billingController.getChargesPreview);
billingRouter.post('/send-charges', billingController.sendCharges);
billingRouter.get('/messages', billingController.getBillingMessages);
billingRouter.get('/relatorio/pdf', billingController.getRelatorioPdf);

export { billingRouter };
