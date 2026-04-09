import { Router } from 'express';
import { InstallmentController } from '../controllers/installment.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const installmentRouter = Router();
const installmentController = new InstallmentController();

// Debug temporário (sem autenticação)
installmentRouter.get('/debug-stats', async (req, res) => {
  const { db } = require('../database');
  const { sql } = require('drizzle-orm');
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total_pending,
      SUM(CASE WHEN DATE(due_date) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN DATE(due_date) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN DATE(due_date) > DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) THEN 1 ELSE 0 END) as inday,
      MIN(due_date) as oldest_due,
      MAX(due_date) as newest_due,
      DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) as server_curdate,
      CONVERT_TZ(NOW(), '+00:00', '-03:00') as server_now
    FROM installments
    WHERE status = 'pending' AND deleted_at IS NULL
  `);
  const result2 = await db.execute(sql`
    SELECT due_date, status, COUNT(*) as qty
    FROM installments
    WHERE deleted_at IS NULL
    GROUP BY due_date, status
    ORDER BY due_date ASC
    LIMIT 20
  `);
  res.json({ summary: result[0], sample: result2[0] });
});

// Todas as rotas de crediário requerem autenticação
installmentRouter.use(ensureAuthenticated);

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
