import { Router } from 'express';
import { SaleController } from '../controllers/sale.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

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
saleRouter.delete('/:id', saleController.cancel);
saleRouter.get('/:id', saleController.getById);

export { saleRouter };
