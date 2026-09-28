import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';
import { DeliveryScheduleController } from '../controllers/delivery-schedule.controller';

const deliveryScheduleRouter = Router();
const ctrl = new DeliveryScheduleController();

deliveryScheduleRouter.use(ensureAuthenticated);
deliveryScheduleRouter.use(ensureAuthorized(['admin']));

deliveryScheduleRouter.get('/',              ctrl.getSchedule);
deliveryScheduleRouter.post('/:id/release',  ctrl.releaseSlot);

export { deliveryScheduleRouter };
