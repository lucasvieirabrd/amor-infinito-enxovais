import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export function ensureAuthorized(roles: ('admin' | 'seller')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Usuário não autenticado', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError('Acesso negado: permissão insuficiente', 403);
    }

    return next();
  };
}
