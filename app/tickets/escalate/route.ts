import { ErrorBadRequest } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  systemsStaffId: uuidSchema,
  // El requerimiento ya depurado por el asesor: lo que sistemas debe hacer.
  requirement: textareaSchema.min(3, { error: 'validators.form.invalid' }),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});

export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, systemsStaffId, requirement, priority } = validateRequest({ schema, req });
  const me = req.staff!;
  const t = await findVisibleTicket(me, id);
  if (t.status === 'CLOSED' || t.status === 'ESCALATED') {
    throw new ErrorBadRequest({ code: 'ticket.state' });
  }

  const target = await prisma.staff.findUnique({ where: { id: systemsStaffId } });
  if (!target || !target.active || target.role !== 'SYSTEMS') {
    throw new ErrorBadRequest({ code: 'staff.systems.notSystems' });
  }

  await prisma.$transaction([
    prisma.ticketComment.create({
      data: { ticketId: id, authorId: me.id, body: requirement, internal: true },
    }),
    prisma.ticket.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        escalatedToId: systemsStaffId,
        escalatedAt: new Date(),
        ...(priority ? { priority } : {}),
        ...(!t.firstResponseAt && t.ownerId === me.id ? { firstResponseAt: new Date() } : {}),
      },
    }),
  ]);
  return response(res, req, next)({ id, status: 'ESCALATED' });
}
