import { Prisma } from '@prisma/client';
import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { dateSchema, stringSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { pushAccess } from '@/app/access/access.shared';
import { accrueCommission, addMonths, intervalMonths } from '@/app/billing/billing.shared';
import { amountSchema } from '@/app/plans/plans.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  subscriptionId: uuidSchema,
  // Por defecto, el precio congelado de la suscripción.
  amount: amountSchema.optional(),
  method: z.enum(['TRANSFER', 'CARD', 'CASH', 'OTHER'], { error: 'validators.form.invalid' }),
  // Número de transferencia o comprobante. Registrar dos veces la misma
  // referencia devuelve el pago existente en vez de duplicarlo.
  externalRef: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || undefined : v),
    stringSchema.optional()
  ),
  paidAt: dateSchema.optional(),
});

const toPayment = (p: {
  id: string;
  status: string;
  amount: Prisma.Decimal;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
  method: string | null;
  externalRef: string | null;
}) => ({
  id: p.id,
  status: p.status,
  amount: p.amount,
  currency: p.currency,
  periodStart: p.periodStart,
  periodEnd: p.periodEnd,
  paidAt: p.paidAt,
  method: p.method,
  externalRef: p.externalRef,
});

/**
 * Registro manual de un pago (sin pasarela). En una sola transacción:
 *  1. el pago cubre el siguiente período según el plazo del plan;
 *  2. la suscripción queda ACTIVE hasta el fin de ese período;
 *  3. se devenga la comisión del asesor titular, en su liquidación abierta;
 *  4. queda pendiente enviarle al producto la nueva fecha y el tope de usuarios.
 * El envío al producto va después del commit y nunca hace fallar el registro.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { subscriptionId, amount, method, externalRef, paidAt } = validateRequest({ schema, req });

  if (externalRef) {
    const dup = await prisma.payment.findUnique({ where: { externalRef } });
    if (dup) return response(res, req, next)({ ...toPayment(dup), duplicate: true });
  }

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!sub) throw new ErrorNotFound({ code: 'subscription.notFound' });
  if (sub.status === 'CANCELED') throw new ErrorBadRequest({ code: 'subscription.canceled' });

  const paid = paidAt ?? new Date();
  // Si todavía está vigente (o en prueba), el nuevo período arranca donde
  // termina el actual: pagar antes no hace perder días. Si ya venció, arranca
  // el día del pago: los días sin pagar no se cobran.
  const periodStart = sub.currentPeriodEnd > paid ? sub.currentPeriodEnd : paid;
  const periodEnd = addMonths(periodStart, intervalMonths(sub.plan.interval));

  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clientId: sub.clientId,
          subscriptionId: sub.id,
          status: 'PAID',
          amount: amount ?? sub.amount,
          currency: sub.currency,
          periodStart,
          periodEnd,
          paidAt: paid,
          method,
          externalRef: externalRef ?? null,
        },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'ACTIVE', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
      });
      await accrueCommission(p, tx);
      await tx.productAccount.update({
        where: { id: sub.productAccountId },
        data: {
          accessUntil: periodEnd,
          maxUsers: sub.plan.maxUsers,
          accessPaymentId: p.id,
          accessPushedAt: null,
        },
      });
      return p;
    });
  } catch (err: any) {
    // Dos registros simultáneos con la misma referencia: gana uno.
    if (externalRef && err?.code === 'P2002') {
      const dup = await prisma.payment.findUniqueOrThrow({ where: { externalRef } });
      return response(res, req, next)({ ...toPayment(dup), duplicate: true });
    }
    throw err;
  }

  const access = await pushAccess(sub.productAccountId);
  return response(res, req, next)({ ...toPayment(payment), duplicate: false, access });
}
