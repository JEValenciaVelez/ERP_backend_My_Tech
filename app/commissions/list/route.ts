import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  staffId: z.uuid().optional(),
  status: z.enum(['PENDING', 'SETTLED', 'REVERSED']).optional(),
  settlementId: z.uuid().optional(),
});

/** Comisiones: el asesor solo ve las suyas, aunque pida las de otro. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { staffId, status, settlementId } = validateRequest({ schema, req });
  const me = req.staff!;
  const owner = me.role === 'ADMIN' ? staffId : me.id;

  const commissions = await prisma.commission.findMany({
    where: {
      ...(owner ? { staffId: owner } : {}),
      ...(status ? { status } : {}),
      ...(settlementId ? { settlementId } : {}),
    },
    include: {
      staff: { select: { id: true, name: true } },
      payment: { include: { client: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return response(
    res,
    req,
    next
  )(
    commissions.map((c) => ({
      id: c.id,
      staff: c.staff,
      client: c.payment.client,
      paymentId: c.paymentId,
      paymentAmount: c.payment.amount,
      currency: c.payment.currency,
      paidAt: c.payment.paidAt,
      rate: c.rate,
      amount: c.amount,
      status: c.status,
      settlementId: c.settlementId,
      reversedAt: c.reversedAt,
      reversedReason: c.reversedReason,
    }))
  );
}
