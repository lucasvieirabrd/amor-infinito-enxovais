import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const authRouter = Router();
const authController = new AuthController();

authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', ensureAuthenticated, authController.me);

export { authRouter };
