import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { passwordSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { nameSchema, rateSchema, roleSchema, toStaff } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import { hashSecret } from '@/helpers/auth';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  name: nameSchema.optional(),
  role: roleSchema.optional(),
  commissionRate: rateSchema.nullable().optional(),
  active: z.boolean().optional(),
  password: passwordSchema.min(8, { error: 'validators.password.minLength' }).optional(),
});

/**
 * Edición del staff. Cambiar el % de un asesor solo afecta los pagos que
 * entren desde ahora: cada comisión ya guardó el % con que se devengó.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, name, role, commissionRate, active, password } = validateRequest({ schema, req });

  const staff = await prisma.staff.findUnique({ where: { id } });
  if (!staff) throw new ErrorNotFound({ code: 'staff.notFound' });

  // Un admin no se desactiva ni se degrada solo: podría quedar el ERP sin admin.
  if (id === req.staff!.id && (active === false || (role && role !== 'ADMIN'))) {
    throw new ErrorBadRequest({ code: 'staff.self.deactivate' });
  }

  const finalRole = role ?? staff.role;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (active !== undefined) data.active = active;
  if (password !== undefined) data.passwordHash = await hashSecret(password);
  if (commissionRate !== undefined) {
    if (finalRole !== 'ADVISOR' && commissionRate !== null) {
      throw new ErrorBadRequest({ code: 'validators.form.invalid' });
    }
    data.commissionRate = commissionRate;
  }
  if (finalRole !== 'ADVISOR') data.commissionRate = null;

  const updated = await prisma.staff.update({ where: { id }, data });
  return response(res, req, next)(toStaff(updated));
}
