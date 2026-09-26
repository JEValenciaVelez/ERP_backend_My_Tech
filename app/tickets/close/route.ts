import { ErrorBadRequest } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema });

/** Lo confirma el asesor (o el admin) después de verificarlo con el cliente. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id } = validateRequest({ schema, req });
  const t = await findVisibleTicket(req.staff!, id);
  if (t.status !== 'RESOLVED') throw new ErrorBadRequest({ code: 'ticket.state' });

  await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
  return response(res, req, next)({ id, status: 'CLOSED' });
}
