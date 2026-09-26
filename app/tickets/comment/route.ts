import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  body: textareaSchema.min(1, { error: 'validators.form.invalid' }),
  internal: z.boolean().optional(),
});

/**
 * Comentar. La primera respuesta del responsable marca firstResponseAt, y un
 * ticket OPEN pasa a IN_PROGRESS cuando alguien empieza a trabajarlo.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, body, internal = false } = validateRequest({ schema, req });
  const me = req.staff!;
  const t = await findVisibleTicket(me, id);

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.ticketComment.create({
      data: { ticketId: id, authorId: me.id, body, internal },
    });
    await tx.ticket.update({
      where: { id },
      data: {
        ...(t.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
        ...(!t.firstResponseAt && t.ownerId === me.id ? { firstResponseAt: new Date() } : {}),
      },
    });
    return c;
  });
  return response(res, req, next)({ id: comment.id, createdAt: comment.createdAt });
}
