import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const reportRouter = Router();
const reportController = new ReportController();

reportRouter.use(ensureAuthenticated);

reportRouter.get('/credit', reportController.getCreditReport);
reportRouter.get('/sellers', ensureAuthorized(['admin']), reportController.getSellerReport);
reportRouter.get('/delinquency-score', ensureAuthorized(['admin']), reportController.getDelinquencyScore);

export { reportRouter };
