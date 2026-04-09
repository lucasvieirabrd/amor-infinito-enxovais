import { Router } from 'express';
import { InstallmentController } from '../controllers/installment.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const installmentRouter = Router();
const installmentController = new InstallmentController();

// Todas as rotas de crediário requerem autenticação
installmentRouter.use(ensureAuthenticated);

// Debug temporário
installmentRouter.get('/debug-stats', async (req, res) => {
  const { db } = require('../database');
  const { sql } = require('drizzle-orm');
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total_pending,
      SUM(CASE WHEN DATE(due_date) < CURDATE() THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN DATE(due_date) = CURDATE() THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN DATE(due_date) > CURDATE() THEN 1 ELSE 0 END) as inday,
      MIN(due_date) as oldest_due,
      MAX(due_date) as newest_due,
      CURDATE() as server_curdate,
      NOW() as server_now
    FROM installments
    WHERE status = 'pending' AND deleted_at IS NULL
  `);
  res.json(result[0]);
});

// Listagens gerais
installmentRouter.get('/stats', installmentController.getStats);
installmentRouter.get('/billing', installmentController.getBillingList);
installmentRouter.get('/active', installmentController.listActiveCrediarios);
installmentRouter.get('/overdue', installmentController.listOverdue);

// Por cliente
installmentRouter.get('/customer/:customerId', installmentController.getByCustomer);

// Operações por parcela
installmentRouter.post('/:id/pay', installmentController.markAsPaid);
installmentRouter.post('/:id/revert', ensureAuthorized(['admin']), installmentController.revertPayment);
installmentRouter.put('/:id', ensureAuthorized(['admin']), installmentController.update);
installmentRouter.patch("/:id/due-date", ensureAuthorized(["admin"]), installmentController.updateDueDate);
installmentRouter.post("/billing/manual-send", ensureAuthorized(["admin"]), installmentController.sendManualBilling);

export { installmentRouter };
