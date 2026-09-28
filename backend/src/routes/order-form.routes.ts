import { Router } from 'express';
import { OrderFormController } from '../controllers/order-form.controller';

const orderFormRouter = Router();
const ctrl = new OrderFormController();

// Public routes — no authentication required (all gated by vendor code)
orderFormRouter.get('/seller',       ctrl.validateSeller);
orderFormRouter.get('/holidays',     ctrl.holidays);
orderFormRouter.get('/products',     ctrl.products);
orderFormRouter.get('/booked-slots', ctrl.bookedSlots);
orderFormRouter.post('/reserve',     ctrl.reserve);

export { orderFormRouter };
