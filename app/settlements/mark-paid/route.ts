import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { dateSchema, textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { toSettlement } from '@/app/settlements/settlements.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  paidAt: dateSchema.optional(),
  notes: textareaSchema.optional(),
});

/** Registra que le pagaste al asesor (transferencia manual). */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, paidAt, notes } = validateRequest({ schema, req });

  const s = await prisma.settlement.findUnique({ where: { id } });
  if (!s) throw new ErrorNotFound({ code: 'settlement.notFound' });
  if (s.status !== 'CLOSED') throw new ErrorBadRequest({ code: 'settlement.notClosed' });

  const paid = await prisma.settlement.update({
    where: { id },
    data: { status: 'PAID', paidAt: paidAt ?? new Date(), notes: notes ?? s.notes },
    include: { staff: { select: { id: true, name: true } } },
  });
  return response(res, req, next)(toSettlement(paid));
}
