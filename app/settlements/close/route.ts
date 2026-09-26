import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { recalcSettlement } from '@/app/billing/billing.shared';
import { toSettlement } from '@/app/settlements/settlements.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema });

/**
 * Cierra el período: el total queda congelado y sus comisiones pasan a
 * SETTLED. Las comisiones que entren después abren la siguiente liquidación,
 * que empieza en este momento.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id } = validateRequest({ schema, req });

  const s = await prisma.settlement.findUnique({ where: { id } });
  if (!s) throw new ErrorNotFound({ code: 'settlement.notFound' });
  if (s.status !== 'OPEN') throw new ErrorBadRequest({ code: 'settlement.notOpen' });

  const closed = await prisma.$transaction(async (tx) => {
    await recalcSettlement(id, tx);
    await tx.commission.updateMany({
      where: { settlementId: id, status: 'PENDING' },
      data: { status: 'SETTLED' },
    });
    const now = new Date();
    return tx.settlement.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: now, periodEnd: now },
      include: { staff: { select: { id: true, name: true } } },
    });
  });
  return response(res, req, next)(toSettlement(closed));
}
