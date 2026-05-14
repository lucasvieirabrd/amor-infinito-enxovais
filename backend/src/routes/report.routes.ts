import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const reportRouter = Router();
const reportController = new ReportController();

reportRouter.use(ensureAuthenticated);

reportRouter.get('/credit', reportController.getCreditReport);

export { reportRouter };
