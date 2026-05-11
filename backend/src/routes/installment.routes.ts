import { Router } from 'express';
import { InstallmentController } from '../controllers/installment.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const installmentRouter = Router();
const installmentController = new InstallmentController();

// Todas as rotas de crediário requerem autenticação
installmentRouter.use(ensureAuthenticated);

// Listagens gerais
installmentRouter.get('/stats', installmentController.getStats);
installmentRouter.get('/payments-last-30-days', installmentController.getPaymentsLast30Days);
installmentRouter.get('/billing', installmentController.getBillingList);
installmentRouter.get('/active', installmentController.listActiveCrediarios);
installmentRouter.get('/overdue', installmentController.listOverdue);

// Por cliente
installmentRouter.get('/customer/:customerId', installmentController.getByCustomer);

// Edição em lote
installmentRouter.patch('/bulk-update-day', ensureAuthorized(['admin']), installmentController.bulkUpdateDay);

// Operações por parcela
installmentRouter.post('/:id/pay', installmentController.markAsPaid);
installmentRouter.post('/:id/revert', ensureAuthorized(['admin']), installmentController.revertPayment);
installmentRouter.put('/:id', ensureAuthorized(['admin']), installmentController.update);
installmentRouter.delete('/:id', ensureAuthorized(['admin']), installmentController.delete);
installmentRouter.patch("/:id/due-date", ensureAuthorized(["admin"]), installmentController.updateDueDate);
installmentRouter.post("/billing/manual-send", ensureAuthorized(["admin"]), installmentController.sendManualBilling);

export { installmentRouter };
