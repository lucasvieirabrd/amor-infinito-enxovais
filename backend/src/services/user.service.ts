import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';
import { AppError } from '../utils/AppError';

const userRepository = new UserRepository();

export class UserService {
  async listUsers() {
    return userRepository.list();
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'seller';
    allowedTabs?: string[];
  }) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) throw new AppError('Este e-mail já está em uso', 400);

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await userRepository.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: data.role,
      allowedTabs: data.role === 'admin' ? null : (data.allowedTabs ?? []),
    });

    if (!user) throw new AppError('Erro ao criar usuário', 500);
    const { password, resetToken, resetTokenExpires, ...safe } = user as any;
    return safe;
  }

  async updateUser(id: string, data: {
    name?: string;
    email?: string;
    password?: string;
    role?: 'admin' | 'seller';
    allowedTabs?: string[];
  }) {
    const existing = await userRepository.findByIdAny(id);
    if (!existing) throw new AppError('Usuário não encontrado', 404);

    if (data.email && data.email !== existing.email) {
      const emailUsed = await userRepository.findByEmail(data.email);
      if (emailUsed) throw new AppError('Este e-mail já está em uso', 400);
    }

    // Protect last active admin from being demoted
    if (data.role && data.role !== 'admin' && existing.role === 'admin') {
      const adminCount = await userRepository.countActiveAdmins();
      if (adminCount <= 1) throw new AppError('Não é possível rebaixar o único administrador ativo', 400);
    }

    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
    if (data.role !== undefined) {
      updateData.role = data.role;
      updateData.allowedTabs = data.role === 'admin' ? null : (data.allowedTabs ?? existing.allowedTabs ?? []);
    } else if (data.allowedTabs !== undefined) {
      updateData.allowedTabs = existing.role === 'admin' ? null : data.allowedTabs;
    }

    const updated = await userRepository.update(id, updateData);
    if (!updated) throw new AppError('Erro ao atualizar usuário', 500);
    const { password, resetToken, resetTokenExpires, ...safe } = updated as any;
    return safe;
  }

  async toggleActive(id: string, active: boolean) {
    const existing = await userRepository.findByIdAny(id);
    if (!existing) throw new AppError('Usuário não encontrado', 404);

    if (!active && existing.role === 'admin') {
      const adminCount = await userRepository.countActiveAdmins();
      if (adminCount <= 1) throw new AppError('Não é possível desativar o único administrador ativo', 400);
    }

    const updated = await userRepository.update(id, {
      deletedAt: active ? null : new Date(),
    });
    if (!updated) throw new AppError('Erro ao atualizar usuário', 500);
    const { password, resetToken, resetTokenExpires, ...safe } = updated as any;
    return safe;
  }
}
