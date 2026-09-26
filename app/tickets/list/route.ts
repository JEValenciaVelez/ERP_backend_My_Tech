import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { ticketScopeWhere } from '@/app/tickets/tickets.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  clientId: z.uuid().optional(),
  openOnly: z.boolean().optional(),
});

export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { status, clientId, openOnly } = validateRequest({ schema, req });

  const tickets = await prisma.ticket.findMany({
    where: {
      ...ticketScopeWhere(req.staff!),
      ...(status ? { status } : {}),
      ...(openOnly ? { status: { not: 'CLOSED' } } : {}),
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      escalatedTo: { select: { id: true, name: true } },
      productAccount: { include: { product: { select: { code: true } } } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 300,
  });

  return response(
    res,
    req,
    next
  )(
    tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      client: t.client,
      product: t.productAccount?.product.code ?? null,
      owner: t.owner,
      escalatedTo: t.escalatedTo,
      comments: t._count.comments,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  );
}
