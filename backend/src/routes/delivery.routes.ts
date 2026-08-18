import { Router } from 'express';
import { DeliveryController } from '../controllers/delivery.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureTabAccess } from '../middlewares/ensureTabAccess';

const deliveryRouter = Router();
const deliveryController = new DeliveryController();

deliveryRouter.use(ensureAuthenticated);
deliveryRouter.use(ensureTabAccess('entregas'));

deliveryRouter.get('/', deliveryController.list);
deliveryRouter.patch('/:id/deliver', deliveryController.deliver);

export { deliveryRouter };
