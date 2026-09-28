import { Router } from 'express';
import { ExternalSellerController } from '../controllers/external-seller.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const externalSellerRouter = Router();
const ctrl = new ExternalSellerController();

externalSellerRouter.use(ensureAuthenticated);
externalSellerRouter.use(ensureAuthorized(['admin']));

externalSellerRouter.get('/',     ctrl.list);
externalSellerRouter.post('/',    ctrl.create);
externalSellerRouter.put('/:id',  ctrl.update);
externalSellerRouter.delete('/:id', ctrl.remove);

export { externalSellerRouter };
