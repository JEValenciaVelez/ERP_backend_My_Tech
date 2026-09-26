import { dateSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { clientScopeWhere } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  clientId: z.uuid().optional(),
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

/** Pagos: el admin ve todos; el asesor los de sus clientes actuales. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { clientId, status, from, to, limit = 200 } = validateRequest({ schema, req });
  const me = req.staff!;

  const payments = await prisma.payment.findMany({
    where: {
      client: clientScopeWhere(me),
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      subscription: { include: { plan: true } },
      commission: { include: { staff: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return response(
    res,
    req,
    next
  )(
    payments.map((p) => ({
      id: p.id,
      client: p.client,
      plan: p.subscription.plan.name,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      paidAt: p.paidAt,
      refundedAt: p.refundedAt,
      method: p.method,
      externalRef: p.externalRef,
      // Cada asesor ve solo su comisión; el admin, la de todos.
      commission:
        p.commission && (me.role === 'ADMIN' || p.commission.staffId === me.id)
          ? {
              staff: p.commission.staff,
              rate: p.commission.rate,
              amount: p.commission.amount,
              status: p.commission.status,
            }
          : null,
    }))
  );
}
