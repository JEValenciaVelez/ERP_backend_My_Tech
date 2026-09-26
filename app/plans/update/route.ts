import { ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { amountSchema, maxUsersSchema, toPlan } from '@/app/plans/plans.shared';
import { nameSchema } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  name: nameSchema.optional(),
  amount: amountSchema.optional(),
  maxUsers: maxUsersSchema.optional(),
  active: z.boolean().optional(),
});

/**
 * Cambiar el precio de un plan no toca a quien ya lo tiene: cada suscripción
 * congeló su precio. Aplica a las suscripciones que se creen desde ahora.
 * Desactivarlo lo saca de la oferta sin afectar a las vigentes.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, ...data } = validateRequest({ schema, req });

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new ErrorNotFound({ code: 'plan.notFound' });

  const updated = await prisma.plan.update({ where: { id }, data, include: { product: true } });
  return response(res, req, next)(toPlan(updated));
}
