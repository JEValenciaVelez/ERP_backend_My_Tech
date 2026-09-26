import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { refreshPastDue } from '@/app/billing/billing.shared';
import { assertClientVisible, staffSummary } from '@/app/clients/clients.shared';
import { toPlan } from '@/app/plans/plans.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema });

/** Ficha del cliente: cuentas, suscripciones, pagos y quién lo ha atendido. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id } = validateRequest({ schema, req });
  const me = req.staff!;
  await assertClientVisible(me, id);
  await refreshPastDue();

  const c = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      accounts: { include: { product: true } },
      assignments: { include: { staff: true }, orderBy: { startedAt: 'desc' } },
      subscriptions: {
        include: {
          plan: { include: { product: true } },
          productAccount: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      payments: { include: { commission: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  // El asesor ve su propia comisión de cada pago, no la de otros asesores
  // que atendieron antes al cliente.
  const commissionFor = (p: (typeof c.payments)[number]) => {
    if (!p.commission) return null;
    if (me.role !== 'ADMIN' && p.commission.staffId !== me.id) return null;
    return { amount: p.commission.amount, rate: p.commission.rate, status: p.commission.status };
  };

  return response(
    res,
    req,
    next
  )({
    id: c.id,
    name: c.name,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    taxId: c.taxId,
    active: c.active,
    createdAt: c.createdAt,
    advisor: staffSummary(c.assignments.find((a) => !a.endedAt && !a.isBackup)?.staff),
    assignments: c.assignments.map((a) => ({
      id: a.id,
      staff: staffSummary(a.staff),
      isBackup: a.isBackup,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
    })),
    accounts: c.accounts.map((a) => ({
      id: a.id,
      product: a.product.code,
      productName: a.product.name,
      externalId: a.externalId,
      active: a.active,
      accessUntil: a.accessUntil,
      maxUsers: a.maxUsers,
      accessPending: !!a.accessUntil && !a.accessPushedAt,
      lastPushError: me.role === 'ADMIN' ? a.lastPushError : undefined,
    })),
    subscriptions: c.subscriptions.map((s) => ({
      id: s.id,
      productAccountId: s.productAccountId,
      product: s.productAccount.product.code,
      plan: toPlan(s.plan),
      status: s.status,
      amount: s.amount,
      currency: s.currency,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      startedAt: s.startedAt,
      canceledAt: s.canceledAt,
      cancelReason: s.cancelReason,
    })),
    payments: c.payments.map((p) => ({
      id: p.id,
      subscriptionId: p.subscriptionId,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      paidAt: p.paidAt,
      refundedAt: p.refundedAt,
      method: p.method,
      externalRef: p.externalRef,
      commission: commissionFor(p),
    })),
  });
}
