import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { refreshPastDue } from '@/app/billing/billing.shared';
import { clientScopeWhere, staffSummary } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  search: z.string().max(120).optional(),
  advisorId: z.uuid().optional(),
});

/**
 * Cartera de clientes. El admin ve todos (y puede filtrar por asesor); el
 * asesor solo los suyos. Cada fila trae su titular y el estado de cada
 * suscripción, que es lo que el asesor necesita para saber a quién llamar.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { search, advisorId } = validateRequest({ schema, req });
  const me = req.staff!;
  await refreshPastDue();

  const clients = await prisma.client.findMany({
    where: {
      ...clientScopeWhere(me),
      ...(advisorId && me.role === 'ADMIN'
        ? { assignments: { some: { staffId: advisorId, endedAt: null, isBackup: false } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { taxId: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      assignments: { where: { endedAt: null, isBackup: false }, include: { staff: true } },
      subscriptions: {
        where: { status: { not: 'CANCELED' } },
        include: { plan: true, productAccount: { include: { product: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return response(
    res,
    req,
    next
  )(
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      taxId: c.taxId,
      active: c.active,
      advisor: staffSummary(c.assignments[0]?.staff),
      subscriptions: c.subscriptions.map((s) => ({
        id: s.id,
        product: s.productAccount.product.code,
        plan: s.plan.name,
        status: s.status,
        amount: s.amount,
        currency: s.currency,
        currentPeriodEnd: s.currentPeriodEnd,
      })),
    }))
  );
}
