import { Router } from 'express';
import { DeliveryController } from '../controllers/delivery.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const deliveryRouter = Router();
const deliveryController = new DeliveryController();

deliveryRouter.use(ensureAuthenticated);

deliveryRouter.get('/', deliveryController.list);
deliveryRouter.patch('/:id/deliver', deliveryController.deliver);

export { deliveryRouter };
