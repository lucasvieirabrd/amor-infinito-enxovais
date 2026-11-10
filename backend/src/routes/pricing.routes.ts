import { Router } from 'express';
import { PricingController } from '../controllers/pricing.controller';

const pricingRouter = Router();
const pricingController = new PricingController();

// All routes require the access code in the body/query — no JWT required (public page)
pricingRouter.post('/validate', pricingController.validate);
pricingRouter.post('/calculate', pricingController.calculate);
pricingRouter.post('/history', pricingController.saveHistory);
pricingRouter.get('/history', pricingController.getHistory);
pricingRouter.get('/history/:id', pricingController.getHistoryDetail);
pricingRouter.patch('/params', pricingController.updateParams);
pricingRouter.patch('/access-code', pricingController.updateAccessCode);

export { pricingRouter };
