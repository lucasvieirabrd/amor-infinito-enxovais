import { Router } from 'express';
import { RenegotiationController } from '../controllers/renegotiation.controller';
import { InstallmentController } from '../controllers/installment.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const renegotiationRouter = Router();
const renegotiationController = new RenegotiationController();
const installmentController = new InstallmentController();

renegotiationRouter.use(ensureAuthenticated);
renegotiationRouter.post('/', ensureAuthorized(['admin']), renegotiationController.renegotiate);
renegotiationRouter.get('/:id', renegotiationController.getById);
renegotiationRouter.post('/:renId/installments', ensureAuthorized(['admin']), installmentController.addToRenegotiation);

export { renegotiationRouter };
