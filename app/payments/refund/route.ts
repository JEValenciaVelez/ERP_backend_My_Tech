import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { reverseCommission } from '@/app/billing/billing.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema, reason: textareaSchema.min(3) });

/**
 * Reembolso: el pago pasa a REFUNDED y su comisión se reversa (si ya se
 * liquidó, se descuenta de la próxima liquidación del asesor). No mueve la
 * fecha de acceso: si hay que cortar el servicio, se cancela la suscripción.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, reason } = validateRequest({ schema, req });

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new ErrorNotFound({ code: 'payment.notFound' });
  if (payment.status !== 'PAID') throw new ErrorBadRequest({ code: 'payment.notPaid' });

  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    const c = await reverseCommission(id, reason, tx);
    return { payment: p, commission: c };
  });

  return response(
    res,
    req,
    next
  )({
    id: result.payment.id,
    status: result.payment.status,
    commissionStatus: result.commission?.status ?? null,
  });
}
