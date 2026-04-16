import { Router } from 'express';
import { SaleController } from '../controllers/sale.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';
import { db } from '../database';
import { sql } from 'drizzle-orm';

const saleRouter = Router();
const saleController = new SaleController();

// Todas as rotas de vendas requerem autenticação
saleRouter.use(ensureAuthenticated);

saleRouter.post('/', saleController.register);
saleRouter.get('/', saleController.list);
saleRouter.get('/history', saleController.listWithFilters);
saleRouter.get('/total-sales', saleController.getTotalSales);
saleRouter.get('/sales-last-7-days', saleController.getSalesLast7Days);
saleRouter.get('/top-products', saleController.getTopProductsThisMonth);

// DIAGNÓSTICO TEMPORÁRIO — apenas admin, remover após validação
saleRouter.get('/diag-installments', ensureAuthorized(['admin']), async (req, res) => {
  const [rows] = await db.execute(sql`
    SELECT
      s.sale_number,
      DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00'))   AS sale_date,
      s.total_amount,
      s.installments_count,
      c.name                                               AS cliente,
      i.installment_number,
      DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00'))    AS due_date,
      i.original_amount,
      i.paid_amount,
      i.status,
      CASE
        WHEN DATE(CONVERT_TZ(i.due_date, '+00:00', '-03:00'))
             = DATE(CONVERT_TZ(s.sale_date, '+00:00', '-03:00'))
        THEN 'BUG: due_date = sale_date'
        ELSE 'ok'
      END AS date_check
    FROM sales s
    JOIN customers c  ON s.customer_id = c.id
    JOIN installments i ON i.sale_id  = s.id
    WHERE s.deleted_at  IS NULL
      AND i.deleted_at  IS NULL
      AND s.payment_method = 'installment'
    ORDER BY s.sale_date DESC, i.installment_number ASC
    LIMIT 50
  `);

  const data = rows as any[];

  // Agrupar por venda para facilitar análise
  const salesMap: Record<string, any> = {};
  for (const row of data) {
    const key = row.sale_number;
    if (!salesMap[key]) {
      salesMap[key] = {
        sale_number:        row.sale_number,
        sale_date:          row.sale_date,
        total_amount:       parseFloat(row.total_amount),
        installments_count: row.installments_count,
        cliente:            row.cliente,
        installments:       [],
        issues:             [],
      };
    }
    salesMap[key].installments.push({
      number:     row.installment_number,
      due_date:   row.due_date,
      amount:     parseFloat(row.original_amount),
      paid:       parseFloat(row.paid_amount),
      status:     row.status,
      date_check: row.date_check,
    });
    if (row.date_check !== 'ok') {
      salesMap[key].issues.push(row.date_check);
    }
  }

  // Verificar se valor da parcela bate com total / count
  for (const sale of Object.values(salesMap) as any[]) {
    const regularInstallments = sale.installments.filter((i: any) => i.number > 0);
    if (regularInstallments.length > 0) {
      const expected = parseFloat((sale.total_amount / sale.installments_count).toFixed(2));
      const actual   = regularInstallments[0].amount;
      if (Math.abs(expected - actual) > 0.05) {
        sale.issues.push(`valor parcela esperado R$${expected} mas é R$${actual}`);
      }
    }
  }

  const sales = Object.values(salesMap);
  const withIssues = sales.filter((s: any) => s.issues.length > 0);

  res.json({
    total_sales_checked: sales.length,
    sales_with_issues:   withIssues.length,
    issues:              withIssues,
    all:                 sales,
  });
});

saleRouter.delete('/:id', saleController.cancel);
saleRouter.get('/:id', saleController.getById);

export { saleRouter };
