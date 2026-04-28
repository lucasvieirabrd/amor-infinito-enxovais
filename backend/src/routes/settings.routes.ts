import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const settingsRouter = Router();
const settingsController = new SettingsController();

settingsRouter.use(ensureAuthenticated);

settingsRouter.get('/', settingsController.getAll);
settingsRouter.patch('/', ensureAuthorized(['admin']), settingsController.upsert);

export { settingsRouter };
