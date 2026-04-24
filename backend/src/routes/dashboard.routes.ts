import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const dashboardRouter = Router();
const dashboardController = new DashboardController();

dashboardRouter.use(ensureAuthenticated);
dashboardRouter.get('/sales-metrics', (req, res) => dashboardController.getSalesMetrics(req, res));

export { dashboardRouter };
