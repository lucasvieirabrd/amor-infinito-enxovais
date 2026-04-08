import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { db } from '../database';
import { users } from '../database/schema';
import { sendPasswordResetEmail } from '../services/email.service';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const authRouter = Router();
const authController = new AuthController();

authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/logout', authController.logout);
authRouter.get("/me", ensureAuthenticated, authController.me);
authRouter.post('/forgot-password', async (req, res) => {
  console.log('forgot-password: Rota chamada com email:', req.body.email);
  try {
    const { email } = req.body;
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hora
    
    console.log("forgot-password: Token gerado e expiracao definida. Atualizando usuario no DB...");
    await db.update(users)
      .set({ resetToken: token, resetTokenExpires: expires })
      .where(eq(users.email, email));
    console.log('forgot-password: Usuario atualizado no DB. Enviando email...');
    await sendPasswordResetEmail(email, token);
    console.log('forgot-password: Email enviado com sucesso.');
    
    res.json({ success: true, message: 'Email de recuperação enviado!' });
  } catch (error) {
    console.error('forgot-password: Erro durante o processo:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});
authRouter.post("/reset-password", authController.resetPassword);

export { authRouter };
