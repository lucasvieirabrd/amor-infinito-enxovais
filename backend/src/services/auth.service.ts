import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/user.repository';
import { AppError } from '../utils/AppError';
import { sendPasswordResetEmail } from './email.service';
import crypto from 'crypto';

const userRepository = new UserRepository();

export class AuthService {
  async register(data: any) {
    const userExists = await userRepository.findByEmail(data.email);
    if (userExists) {
      throw new AppError('Este e-mail já está em uso', 400);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await userRepository.create({
      ...data,
      password: hashedPassword,
    });

    if (!user) {
      throw new AppError('Erro ao criar usuário', 500);
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(data: any) {
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    const { password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AppError('Usuário não encontrado com este e-mail.', 404);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await userRepository.update(user.id, { resetToken, resetTokenExpires });

    await sendPasswordResetEmail(email, resetToken);

    return { message: 'Link de recuperação de senha enviado para o seu e-mail.' };
  }

  async resetPassword(token: string, password: string) {
    const user = await userRepository.findByResetToken(token);

    if (!user || user.resetTokenExpires === null || user.resetTokenExpires < new Date()) {
      throw new AppError('Token de recuperação inválido ou expirado.', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userRepository.update(user.id, { password: hashedPassword, resetToken: null, resetTokenExpires: null });

    return { message: 'Senha redefinida com sucesso.' };
  }
}
