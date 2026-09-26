import { Prisma } from '@prisma/client';

import { monthStart, refreshPastDue } from '@/app/billing/billing.shared';
import { clientScopeWhere } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const sumBy = (rows: { currency: string; _sum: { amount: Prisma.Decimal | null } }[]) =>
  rows.map((r) => ({ currency: r.currency, amount: r._sum.amount ?? new Prisma.Decimal(0) }));

/**
 * Resumen del panel. Admin: todo el negocio. Asesor: su cartera y su bolsillo.
 * Los montos van agrupados por moneda: nunca se suman COP con USD.
 */
export default async function (req: Request, res: Response, next: Next) {
  const me = req.staff!;
  await refreshPastDue();

  const now = new Date();
  const thisMonth = monthStart(now);
  const lastMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const clientWhere = clientScopeWhere(me);

  const [statusCounts, revenueThis, revenueLast, dueSoon, clientCount] = await Promise.all([
    prisma.subscription.groupBy({
      by: ['status'],
      where: { client: clientWhere },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['currency'],
      where: { status: 'PAID', paidAt: { gte: thisMonth }, client: clientWhere },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['currency'],
      where: { status: 'PAID', paidAt: { gte: lastMonth, lt: thisMonth }, client: clientWhere },
      _sum: { amount: true },
    }),
    prisma.subscription.findMany({
      where: {
        client: clientWhere,
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
        currentPeriodEnd: { lt: in30 },
      },
      include: { client: { select: { id: true, name: true } }, plan: true },
      orderBy: { currentPeriodEnd: 'asc' },
      take: 20,
    }),
    prisma.client.count({ where: { ...clientWhere, active: true } }),
  ]);

  const commissionWhere = me.role === 'ADMIN' ? {} : { staffId: me.id };
  const [pendingCommissions, earnedThisMonth, pendingAccess] = await Promise.all([
    prisma.commission.groupBy({
      by: ['staffId'],
      where: { ...commissionWhere, status: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.commission.aggregate({
      where: { ...commissionWhere, status: { not: 'REVERSED' }, createdAt: { gte: thisMonth } },
      _sum: { amount: true },
    }),
    me.role === 'ADMIN'
      ? prisma.productAccount.count({ where: { accessUntil: { not: null }, accessPushedAt: null } })
      : Promise.resolve(undefined),
  ]);

  const subscriptions = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  return response(
    res,
    req,
    next
  )({
    clients: clientCount,
    subscriptions: {
      TRIAL: subscriptions.TRIAL ?? 0,
      ACTIVE: subscriptions.ACTIVE ?? 0,
      PAST_DUE: subscriptions.PAST_DUE ?? 0,
      CANCELED: subscriptions.CANCELED ?? 0,
    },
    revenueThisMonth: sumBy(revenueThis),
    revenueLastMonth: sumBy(revenueLast),
    pendingCommissions: pendingCommissions.reduce(
      (acc, r) => acc.plus(r._sum.amount ?? 0),
      new Prisma.Decimal(0)
    ),
    commissionsThisMonth: earnedThisMonth._sum.amount ?? new Prisma.Decimal(0),
    pendingAccessPushes: pendingAccess,
    dueSoon: dueSoon.map((s) => ({
      subscriptionId: s.id,
      client: s.client,
      plan: s.plan.name,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      amount: s.amount,
      currency: s.currency,
    })),
  });
}
