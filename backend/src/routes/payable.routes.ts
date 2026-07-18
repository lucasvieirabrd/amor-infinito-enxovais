import { Router } from 'express';
import { PayableController } from '../controllers/payable.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const payableRouter = Router();
const controller = new PayableController();

payableRouter.use(ensureAuthenticated);
payableRouter.use(ensureAuthorized(['admin']));

// Recurrences (must come before /:id routes to avoid matching conflicts)
payableRouter.get('/recurrences', controller.listRecurrences);
payableRouter.post('/recurrences', controller.createRecurrence);
payableRouter.patch('/recurrences/:id', controller.updateRecurrence);
payableRouter.delete('/recurrences/:id', controller.removeRecurrence);

// Payables
payableRouter.get('/summary', controller.summary);
payableRouter.get('/', controller.list);
payableRouter.post('/', controller.create);
payableRouter.patch('/:id/pay', controller.pay);
payableRouter.patch('/:id/revert', controller.revert);
payableRouter.patch('/:id', controller.update);
payableRouter.delete('/:id', controller.remove);

export { payableRouter };
