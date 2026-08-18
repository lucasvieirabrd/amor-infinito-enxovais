import { Router } from 'express';
import { KitController } from '../controllers/kit.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';
import { ensureTabAccess } from '../middlewares/ensureTabAccess';

const kitRouter = Router();
const kitController = new KitController();

kitRouter.use(ensureAuthenticated);
kitRouter.use(ensureTabAccess('produtos'));

kitRouter.get('/', (req, res) => kitController.list(req, res));
kitRouter.get('/:id', (req, res) => kitController.getById(req, res));

kitRouter.post('/', ensureAuthorized(['admin']), (req, res) => kitController.create(req, res));
kitRouter.put('/:id', ensureAuthorized(['admin']), (req, res) => kitController.update(req, res));
kitRouter.delete('/:id', ensureAuthorized(['admin']), (req, res) => kitController.delete(req, res));

export { kitRouter };
