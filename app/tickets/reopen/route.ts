import { ErrorBadRequest } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema, reason: textareaSchema.min(3) });

/** El arreglo no funcionó: vuelve a quien lo tenía y cuenta la reapertura. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, reason } = validateRequest({ schema, req });
  const me = req.staff!;
  const t = await findVisibleTicket(me, id);
  if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') {
    throw new ErrorBadRequest({ code: 'ticket.state' });
  }

  const status = t.escalatedToId ? 'ESCALATED' : 'IN_PROGRESS';
  await prisma.$transaction([
    prisma.ticketComment.create({ data: { ticketId: id, authorId: me.id, body: reason } }),
    prisma.ticket.update({
      where: { id },
      data: { status, resolvedAt: null, closedAt: null, reopenCount: { increment: 1 } },
    }),
  ]);
  return response(res, req, next)({ id, status });
}
