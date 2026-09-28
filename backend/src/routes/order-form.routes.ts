import { Router } from 'express';
import { OrderFormController } from '../controllers/order-form.controller';

const orderFormRouter = Router();
const ctrl = new OrderFormController();

// Public routes — no authentication required (products endpoint gated by vendor code)
orderFormRouter.get('/seller',   ctrl.validateSeller);
orderFormRouter.get('/holidays', ctrl.holidays);
orderFormRouter.get('/products', ctrl.products);

export { orderFormRouter };
