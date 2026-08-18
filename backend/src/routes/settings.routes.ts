import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const settingsRouter = Router();
const settingsController = new SettingsController();

settingsRouter.use(ensureAuthenticated);

settingsRouter.get('/', settingsController.getAll);
settingsRouter.patch('/', ensureAuthorized(['admin']), settingsController.upsert);

settingsRouter.get('/system-contacts', settingsController.getSystemContacts);
settingsRouter.put('/system-contacts', ensureAuthorized(['admin']), settingsController.upsertSystemContacts);
settingsRouter.post('/system-contacts/test/:role', ensureAuthorized(['admin']), settingsController.testContactRole);

export { settingsRouter };
