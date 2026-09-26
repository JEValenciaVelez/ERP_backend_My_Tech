import { ErrorBadRequest, ErrorConflict, ErrorNotFound } from 'config/errors';
import { dateSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { pushAccess } from '@/app/access/access.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  productAccountId: uuidSchema,
  planId: uuidSchema,
  startDate: dateSchema.optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
});

/**
 * Suscribe una cuenta a un plan. Nace en TRIAL: el período de prueba (0 días
 * por defecto) termina en currentPeriodEnd, y el primer pago la activa. El
 * precio se congela aquí.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, planId, startDate, trialDays = 0 } = validateRequest({ schema, req });

  const [account, plan] = await Promise.all([
    prisma.productAccount.findUnique({ where: { id: productAccountId } }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!account) throw new ErrorNotFound({ code: 'productAccount.notFound' });
  if (!plan) throw new ErrorNotFound({ code: 'plan.notFound' });
  if (!plan.active) throw new ErrorBadRequest({ code: 'plan.inactive' });
  if (plan.productId !== account.productId)
    throw new ErrorBadRequest({ code: 'plan.wrongProduct' });

  const live = await prisma.subscription.findFirst({
    where: { productAccountId, status: { not: 'CANCELED' } },
  });
  if (live) throw new ErrorConflict({ code: 'subscription.exists' });

  const start = startDate ?? new Date();
  const trialEnd = new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const sub = await prisma.$transaction(async (tx) => {
    const s = await tx.subscription.create({
      data: {
        clientId: account.clientId,
        productAccountId,
        planId,
        status: 'TRIAL',
        amount: plan.amount,
        currency: plan.currency,
        currentPeriodStart: start,
        currentPeriodEnd: trialEnd,
        startedAt: start,
      },
    });
    // La prueba también da acceso: el producto la recibe como cualquier fecha.
    if (trialDays > 0) {
      await tx.productAccount.update({
        where: { id: productAccountId },
        data: {
          accessUntil: trialEnd,
          maxUsers: plan.maxUsers,
          accessPaymentId: `trial:${s.id}`,
          accessPushedAt: null,
        },
      });
    }
    return s;
  });

  if (trialDays > 0) await pushAccess(productAccountId);

  return response(
    res,
    req,
    next
  )({ id: sub.id, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd });
}
