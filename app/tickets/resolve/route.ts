import { ErrorBadRequest } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema, note: textareaSchema.optional() });

/** Lo declara quien arregla (sistemas o el propio asesor). */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, note } = validateRequest({ schema, req });
  const me = req.staff!;
  const t = await findVisibleTicket(me, id);
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
    throw new ErrorBadRequest({ code: 'ticket.state' });
  }

  await prisma.$transaction([
    ...(note
      ? [prisma.ticketComment.create({ data: { ticketId: id, authorId: me.id, body: note } })]
      : []),
    prisma.ticket.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
  ]);
  return response(res, req, next)({ id, status: 'RESOLVED' });
}
