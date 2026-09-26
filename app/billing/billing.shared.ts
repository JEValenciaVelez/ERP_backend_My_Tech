import { Prisma } from '@prisma/client';

import { INTERVAL_MONTHS } from '@/config/constants';
import prisma from '@/models';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Suma meses en UTC recortando al último día (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export const monthStart = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const intervalMonths = (interval: keyof typeof INTERVAL_MONTHS) => INTERVAL_MONTHS[interval];

/**
 * Suscripciones activas cuyo período ya venció pasan a PAST_DUE. Se corre antes
 * de listar o resumir, así el estado nunca queda viejo sin necesitar un cron.
 */
export function refreshPastDue(tx: Tx = prisma) {
  return tx.subscription.updateMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: new Date() } },
    data: { status: 'PAST_DUE' },
  });
}

/**
 * La liquidación abierta del asesor. Si no hay, se abre una que empieza donde
 * terminó la anterior (o ahora, si es la primera): así los períodos nunca se
 * pisan y el admin puede cerrar cuando quiera, no solo a fin de mes.
 */
export async function openSettlement(staffId: string, currency: string, tx: Tx) {
  const open = await tx.settlement.findFirst({ where: { staffId, status: 'OPEN' } });
  if (open) return open;
  const last = await tx.settlement.findFirst({
    where: { staffId },
    orderBy: { periodEnd: 'desc' },
  });
  const periodStart = last ? last.periodEnd : new Date();
  return tx.settlement.create({
    data: { staffId, currency, periodStart, periodEnd: addMonths(periodStart, 1) },
  });
}

/** Total de una liquidación abierta: comisiones vigentes menos descuentos. */
export async function recalcSettlement(settlementId: string, tx: Tx) {
  const s = await tx.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (s.status !== 'OPEN') return s;
  const agg = await tx.commission.aggregate({
    where: { settlementId, status: 'PENDING' },
    _sum: { amount: true },
  });
  const total = new Prisma.Decimal(agg._sum.amount ?? 0).minus(s.deductions);
  return tx.settlement.update({ where: { id: settlementId }, data: { total } });
}

/**
 * Devenga la comisión de un pago para el titular vigente del cliente, con el %
 * que tenga HOY (se copia: cambiarlo después no altera lo ya ganado). Sin
 * titular, o si el titular no comisiona, el pago queda sin comisión.
 */
export async function accrueCommission(
  payment: { id: string; clientId: string; amount: Prisma.Decimal; currency: string },
  tx: Tx
) {
  const owner = await tx.clientAssignment.findFirst({
    where: { clientId: payment.clientId, endedAt: null, isBackup: false },
    include: { staff: true },
  });
  const staff = owner?.staff;
  if (!staff || !staff.active || staff.role !== 'ADVISOR' || staff.commissionRate == null) {
    return null;
  }
  const settlement = await openSettlement(staff.id, payment.currency, tx);
  const commission = await tx.commission.create({
    data: {
      paymentId: payment.id,
      staffId: staff.id,
      rate: staff.commissionRate,
      amount: new Prisma.Decimal(payment.amount).mul(staff.commissionRate).toDecimalPlaces(2),
      settlementId: settlement.id,
    },
  });
  await recalcSettlement(settlement.id, tx);
  return commission;
}

/**
 * Reversa la comisión de un pago reembolsado. Si todavía no se liquidó, sale
 * de su liquidación abierta; si ya se liquidó (y quizá se pagó), se descuenta
 * de la próxima liquidación del asesor.
 */
export async function reverseCommission(paymentId: string, reason: string, tx: Tx) {
  const c = await tx.commission.findUnique({ where: { paymentId } });
  if (!c || c.status === 'REVERSED') return c;
  const wasSettled = c.status === 'SETTLED';
  const reversed = await tx.commission.update({
    where: { id: c.id },
    data: { status: 'REVERSED', reversedAt: new Date(), reversedReason: reason },
  });
  if (wasSettled) {
    const s = await tx.settlement.findUniqueOrThrow({ where: { id: c.settlementId! } });
    const open = await openSettlement(c.staffId, s.currency, tx);
    await tx.settlement.update({
      where: { id: open.id },
      data: { deductions: { increment: c.amount } },
    });
    await recalcSettlement(open.id, tx);
  } else if (c.settlementId) {
    await recalcSettlement(c.settlementId, tx);
  }
  return reversed;
}
