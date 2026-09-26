import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { JWT_ACCESS_TTL, JWT_SECRET } from '@/config/env.config';

export type StaffRoleName = 'ADMIN' | 'ADVISOR' | 'SYSTEMS';

/** Contenido del access token del staff del ERP. */
export interface IAccessPayload {
  staffId: string;
  role: StaffRoleName;
}

export function extractBearerToken(header?: string | null): string | null {
  if (typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export function signAccess(payload: IAccessPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

/** Lanza si el token es inválido o expiró. Quien llama decide el error de dominio. */
export function verifyAccess(token: string): IAccessPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === 'string') throw new Error('auth.invalidToken');
  const { staffId, role } = decoded as Partial<IAccessPayload>;
  if (!staffId || !role) throw new Error('auth.invalidToken');
  return { staffId, role };
}

const SALT_ROUNDS = 10;

/** Se compara contra esto cuando el email no existe: mismo tiempo de respuesta. */
export const HUELLA_FICTICIA = bcrypt.hashSync('clave-que-nadie-tiene', SALT_ROUNDS);

export const hashSecret = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);

export const verifySecret = (plain: string, hash: string) => bcrypt.compare(plain, hash);
