import { ErrorForbidden, ErrorUnauthorized } from 'config/errors';

import { Next, Request, Response } from '@/app/types.d';
import { extractBearerToken, StaffRoleName, verifyAccess } from '@/helpers/auth';
import prisma from '@/models';

/**
 * Autenticación del staff. Se pasa como validator en `create()`:
 *
 *   create(r, '/list', import('@/app/clients/list/route'), requireStaff);
 *   create(r, '/create', import('@/app/staff/create/route'), requireAdmin);
 */
export async function requireAuth(req: Request, _res: Response, next: Next) {
  const token =
    extractBearerToken(req.headers?.authorization) || req.headers?.['x-access-token'] || null;

  if (!token) throw new ErrorUnauthorized({ code: 'auth.required' });

  let payload;
  try {
    payload = verifyAccess(token);
  } catch (err: any) {
    const expired = err?.name === 'TokenExpiredError';
    throw new ErrorUnauthorized({ code: expired ? 'auth.expired' : 'auth.invalidToken' });
  }

  // Se relee de la base en cada request: si desactivan a un asesor, un token
  // todavía vigente no le debe seguir sirviendo.
  const staff = await prisma.staff.findUnique({ where: { id: payload.staffId } });

  if (!staff) throw new ErrorUnauthorized({ code: 'auth.invalid' });
  if (!staff.active) throw new ErrorForbidden({ code: 'auth.user.blocked' });
  if (staff.role !== payload.role) throw new ErrorUnauthorized({ code: 'auth.invalid' });

  req.staff = staff;
  next();
}

/** Restringe por rol. Corre después de requireAuth. */
export function requireRole(...roles: StaffRoleName[]) {
  return function (req: Request, _res: Response, next: Next) {
    if (!req.staff) throw new ErrorUnauthorized({ code: 'auth.required' });
    if (!roles.includes(req.staff.role as StaffRoleName)) {
      throw new ErrorForbidden({ code: 'auth.permissions' });
    }
    next();
  };
}

/** Cualquier miembro del staff; el alcance lo decide cada endpoint. */
export const requireStaff = [requireAuth];
export const requireAdmin = [requireAuth, requireRole('ADMIN')];
export const requireAdminOrAdvisor = [requireAuth, requireRole('ADMIN', 'ADVISOR')];
