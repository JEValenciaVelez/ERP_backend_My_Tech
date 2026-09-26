import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema, planId: uuidSchema });

/**
 * Cambio de nivel o de plazo. Aplica desde el próximo pago: el período ya
 * pagado no se prorratea. El nuevo tope de usuarios sí se envía al registrar
 * ese pago, junto con la nueva fecha.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, planId } = validateRequest({ schema, req });

  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: { productAccount: true },
  });
  if (!sub) throw new ErrorNotFound({ code: 'subscription.notFound' });
  if (sub.status === 'CANCELED') throw new ErrorBadRequest({ code: 'subscription.canceled' });

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new ErrorNotFound({ code: 'plan.notFound' });
  if (!plan.active) throw new ErrorBadRequest({ code: 'plan.inactive' });
  if (plan.productId !== sub.productAccount.productId) {
    throw new ErrorBadRequest({ code: 'plan.wrongProduct' });
  }

  const updated = await prisma.subscription.update({
    where: { id },
    data: { planId, amount: plan.amount, currency: plan.currency },
  });
  return response(
    res,
    req,
    next
  )({ id: updated.id, planId: updated.planId, amount: updated.amount });
}
