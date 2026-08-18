import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { UserRepository } from '../repositories/user.repository';

const userRepository = new UserRepository();

export function ensureTabAccess(tab: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Usuário não autenticado', 401);
    if (req.user.role === 'admin') return next();

    const user = await userRepository.findById(req.user.id);
    if (!user || !user.allowedTabs || !user.allowedTabs.includes(tab)) {
      throw new AppError('Acesso negado: sem permissão para esta área', 403);
    }
    return next();
  };
}

export function ensureAnyTabAccess(tabs: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Usuário não autenticado', 401);
    if (req.user.role === 'admin') return next();

    const user = await userRepository.findById(req.user.id);
    if (!user || !user.allowedTabs || !tabs.some(t => user.allowedTabs!.includes(t))) {
      throw new AppError('Acesso negado: sem permissão para esta área', 403);
    }
    return next();
  };
}
