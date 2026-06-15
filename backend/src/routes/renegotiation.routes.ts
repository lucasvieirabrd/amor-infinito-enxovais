import { Router } from 'express';
import { RenegotiationController } from '../controllers/renegotiation.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const renegotiationRouter = Router();
const renegotiationController = new RenegotiationController();

renegotiationRouter.use(ensureAuthenticated);
renegotiationRouter.post('/', ensureAuthorized(['admin']), renegotiationController.renegotiate);

export { renegotiationRouter };
