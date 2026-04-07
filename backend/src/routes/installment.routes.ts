import { Router } from 'express';
import { InstallmentController } from '../controllers/installment.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const installmentRouter = Router();
const installmentController = new InstallmentController();

// Todas as rotas de crediário requerem autenticação
installmentRouter.use(ensureAuthenticated);

// Listagens gerais
installmentRouter.get('/active', installmentController.listActiveCrediarios);
installmentRouter.get('/overdue', installmentController.listOverdue);

// Por cliente
installmentRouter.get('/customer/:customerId', installmentController.getByCustomer);

// Operações por parcela
installmentRouter.post('/:id/pay', installmentController.markAsPaid);
installmentRouter.post('/:id/revert', ensureAuthorized(['admin']), installmentController.revertPayment);
installmentRouter.put('/:id', ensureAuthorized(['admin']), installmentController.update);

export { installmentRouter };
