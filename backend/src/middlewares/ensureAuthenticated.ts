import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

interface TokenPayload {
  id: string;
  role: 'admin' | 'seller';
}

export function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '') ||
    (typeof req.query.token === 'string' ? req.query.token : undefined);

  if (!token) {
    throw new AppError('JWT token não encontrado', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { id, role } = decoded as TokenPayload;

    req.user = {
      id,
      role,
    };

    return next();
  } catch {
    throw new AppError('JWT token inválido', 401);
  }
}
