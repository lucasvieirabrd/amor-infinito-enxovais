import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';
import { ensureTabAccess } from '../middlewares/ensureTabAccess';

const dashboardRouter = Router();
const dashboardController = new DashboardController();

dashboardRouter.use(ensureAuthenticated);
dashboardRouter.use(ensureTabAccess('dashboard'));
dashboardRouter.get('/sales-metrics', (req, res) => dashboardController.getSalesMetrics(req, res));
dashboardRouter.get('/report/pdf', ensureAuthorized(['admin']), (req, res) => dashboardController.getReportPdf(req, res));

export { dashboardRouter };
