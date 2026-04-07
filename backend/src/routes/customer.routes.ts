import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const customerRouter = Router();
const customerController = new CustomerController();

// Todas as rotas de clientes requerem autenticação
customerRouter.use(ensureAuthenticated);

customerRouter.post('/', customerController.register);
customerRouter.get('/', customerController.list);
customerRouter.get('/:id', customerController.getById);
customerRouter.put('/:id', customerController.update);

// Apenas admin pode realizar o soft delete de um cliente
customerRouter.delete('/:id', ensureAuthorized(['admin']), customerController.delete);

export { customerRouter };
