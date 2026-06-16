import { Router } from 'express';
import { SellerController } from '../controllers/seller.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const sellerRouter = Router();
const sellerController = new SellerController();

sellerRouter.use(ensureAuthenticated);
sellerRouter.get('/', sellerController.list);
sellerRouter.post('/', ensureAuthorized(['admin']), sellerController.create);
sellerRouter.put('/:id', ensureAuthorized(['admin']), sellerController.update);
sellerRouter.delete('/:id', ensureAuthorized(['admin']), sellerController.remove);

export { sellerRouter };
