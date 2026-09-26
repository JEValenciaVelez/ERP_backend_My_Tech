import { ErrorForbidden, ErrorUnauthorized } from 'config/errors';
import { emailSchema, passwordSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { toStaff } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import {
  LOGIN_MAX_POR_CORREO,
  LOGIN_MAX_POR_IP,
  LOGIN_VENTANA_SEGUNDOS,
} from '@/config/env.config';
import { HUELLA_FICTICIA, signAccess, StaffRoleName, verifySecret } from '@/helpers/auth';
import { exigirMargen, type ILimite, olvidarFallos, registrarFallo } from '@/helpers/limite';
import response from '@/helpers/response';
import prisma from '@/models';

const loginSchema = z.object({
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), emailSchema),
  password: passwordSchema,
});

/**
 * Entrada del staff.
 * - Mismo 401 y mismo tiempo para email inexistente y contraseña mala: sin
 *   usuario se compara contra una huella ficticia.
 * - 403 por cuenta desactivada SOLO con credenciales correctas.
 * - 429 por ritmo de fallos, por email y por IP (helpers/limite.ts).
 */
export default async function (req: Request<typeof loginSchema>, res: Response, next: Next) {
  const { email, password } = validateRequest({ schema: loginSchema, req });

  const porCorreo: ILimite = {
    ambito: 'login:correo',
    sujeto: email,
    max: LOGIN_MAX_POR_CORREO,
    ventanaSegundos: LOGIN_VENTANA_SEGUNDOS,
  };
  const porIp: ILimite = {
    ambito: 'login:ip',
    sujeto: req.ip,
    max: LOGIN_MAX_POR_IP,
    ventanaSegundos: LOGIN_VENTANA_SEGUNDOS,
  };
  await exigirMargen(porCorreo, porIp);

  const staff = await prisma.staff.findUnique({ where: { email } });
  const coincide = await verifySecret(password, staff?.passwordHash ?? HUELLA_FICTICIA);

  if (!staff || !coincide) {
    await registrarFallo(porCorreo, porIp);
    throw new ErrorUnauthorized({ code: 'auth.incorrect.userOrPassword' });
  }

  // Solo el del email: un acierto propio no limpia los fallos que esa IP
  // acumuló probando cuentas ajenas.
  await olvidarFallos(porCorreo);

  if (!staff.active) throw new ErrorForbidden({ code: 'auth.user.blocked' });

  const updated = await prisma.staff.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = signAccess({ staffId: staff.id, role: staff.role as StaffRoleName });
  return response(res, req, next)({ accessToken, staff: toStaff(updated) });
}
