import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const holidayRouter = Router();
const holidayController = new HolidayController();

holidayRouter.use(ensureAuthenticated);
holidayRouter.get('/',        holidayController.list);
holidayRouter.post('/',       ensureAuthorized(['admin']), holidayController.create);
holidayRouter.put('/:id',     ensureAuthorized(['admin']), holidayController.update);
holidayRouter.delete('/:id',  ensureAuthorized(['admin']), holidayController.remove);

export { holidayRouter };
