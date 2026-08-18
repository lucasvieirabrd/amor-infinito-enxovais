import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const userRouter = Router();
const userController = new UserController();

userRouter.use(ensureAuthenticated);
userRouter.use(ensureAuthorized(['admin']));

userRouter.get('/', userController.list);
userRouter.post('/', userController.create);
userRouter.put('/:id', userController.update);
userRouter.patch('/:id/active', userController.toggleActive);

export { userRouter };
