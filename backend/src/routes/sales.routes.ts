import { Router } from 'express';
import { SalesController } from '../controllers/sales.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureTabAccess } from '../middlewares/ensureTabAccess';

const salesRoutes = Router();
const salesController = new SalesController();

salesRoutes.use(ensureAuthenticated);
salesRoutes.use(ensureTabAccess('vendas'));

salesRoutes.get('/total-sales', salesController.getTotalSales);
salesRoutes.get('/last-7-days', salesController.getLast7DaysSales);

export { salesRoutes };
