import { Router } from 'express';
import { OrderFormController } from '../controllers/order-form.controller';

const orderFormRouter = Router();
const ctrl = new OrderFormController();

// Public routes — no authentication required
orderFormRouter.get('/seller',   ctrl.validateSeller);
orderFormRouter.get('/holidays', ctrl.holidays);

export { orderFormRouter };
