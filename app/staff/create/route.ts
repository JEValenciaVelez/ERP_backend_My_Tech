import { ErrorBadRequest, ErrorConflict } from 'config/errors';
import { emailSchema, passwordSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { nameSchema, rateSchema, roleSchema, toStaff } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import { hashSecret } from '@/helpers/auth';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  role: roleSchema,
  name: nameSchema,
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), emailSchema),
  password: passwordSchema.min(8, { error: 'validators.password.minLength' }),
  commissionRate: rateSchema.optional(),
});

/** Alta de asesores (comerciales), sistemas o administradores. Solo admin. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { role, name, email, password, commissionRate } = validateRequest({ schema, req });

  // Solo los asesores comisionan: un % en otro rol sería un dato engañoso.
  if (role !== 'ADVISOR' && commissionRate != null) {
    throw new ErrorBadRequest({ code: 'validators.form.invalid' });
  }

  const taken = await prisma.staff.findUnique({ where: { email }, select: { id: true } });
  if (taken) throw new ErrorConflict({ code: 'staff.email.exists' });

  const created = await prisma.staff.create({
    data: {
      role,
      name,
      email,
      passwordHash: await hashSecret(password),
      commissionRate: role === 'ADVISOR' ? (commissionRate ?? null) : null,
    },
  });

  return response(res, req, next)(toStaff(created));
}
