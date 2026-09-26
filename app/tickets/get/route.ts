import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { findVisibleTicket } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema });

export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id } = validateRequest({ schema, req });
  await findVisibleTicket(req.staff!, id);

  const t = await prisma.ticket.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, name: true, contactName: true, phone: true, email: true } },
      owner: { select: { id: true, name: true } },
      escalatedTo: { select: { id: true, name: true } },
      productAccount: { include: { product: { select: { code: true, name: true } } } },
      comments: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return response(
    res,
    req,
    next
  )({
    id: t.id,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    client: t.client,
    product: t.productAccount ? t.productAccount.product : null,
    owner: t.owner,
    escalatedTo: t.escalatedTo,
    firstResponseAt: t.firstResponseAt,
    escalatedAt: t.escalatedAt,
    resolvedAt: t.resolvedAt,
    closedAt: t.closedAt,
    reopenCount: t.reopenCount,
    createdAt: t.createdAt,
    comments: t.comments.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      internal: c.internal,
      createdAt: c.createdAt,
    })),
  });
}
