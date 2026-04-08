import { Router } from 'express';
import { SalesController } from '../controllers/sales.controller';

const salesRoutes = Router();
const salesController = new SalesController();

salesRoutes.get('/total-sales', salesController.getTotalSales);
salesRoutes.get('/last-7-days', salesController.getLast7DaysSales);

export { salesRoutes };
