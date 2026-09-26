import { beforeAll, describe, expect, it } from 'vitest';

import prisma from '@/models';
import { antProduct, api, makePlan, makeStaff } from '@/test.helpers';

/**
 * El flujo del dinero de punta a punta: suscripción, pago manual, período,
 * comisión del asesor titular, liquidación, reembolso y reasignación.
 */

let admin: Awaited<ReturnType<typeof makeStaff>>;
let ana: Awaited<ReturnType<typeof makeStaff>>;
let beto: Awaited<ReturnType<typeof makeStaff>>;
let clientId: string;
let accountId: string;
let subscriptionId: string;
let firstPaymentId: string;
let firstPeriodEnd: Date;

const openSettlement = (staffId: string) =>
  prisma.settlement.findFirst({ where: { staffId, status: 'OPEN' } });

beforeAll(async () => {
  admin = await makeStaff('ADMIN');
  ana = await makeStaff('ADVISOR', 0.1);
  beto = await makeStaff('ADVISOR', 0.05);
  await antProduct();

  const c = await api('clients/create', { name: 'Voltios SAS' }, ana.token);
  clientId = c.body.data.id;
  const acc = await api('clients/link-product', { clientId, productCode: 'ant' }, admin.token);
  accountId = acc.body.data.id;
});

describe('suscripción y primer pago', () => {
  it('crea la suscripción trimestral en prueba con el precio congelado', async () => {
    const plan = await makePlan('QUARTERLY', 300, 25);
    const res = await api(
      'subscriptions/create',
      { productAccountId: accountId, planId: plan.id, startDate: '2026-01-31T12:00:00Z' },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('TRIAL');
    subscriptionId = res.body.data.id;

    // Subir el precio del plan después no cambia lo que paga esta suscripción.
    await api('plans/update', { id: plan.id, amount: 999 }, admin.token);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(sub.amount.toString()).toBe('300');
  });

  it('un asesor no puede registrar pagos', async () => {
    const res = await api('payments/register', { subscriptionId, method: 'TRANSFER' }, ana.token);
    expect(res.status).toBe(403);
  });

  it('registrar el pago activa, adelanta 3 meses, comisiona al titular y deja el acceso pendiente', async () => {
    const paidAt = new Date('2026-01-31T12:00:00Z');
    const res = await api(
      'payments/register',
      { subscriptionId, method: 'TRANSFER', externalRef: 'TRF-0001', paidAt: paidAt.toISOString() },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'PAID', amount: '300', duplicate: false });
    firstPaymentId = res.body.data.id;

    // 31 ene + 3 meses = 30 abr (se recorta al último día del mes).
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(sub.status).toBe('ACTIVE');
    firstPeriodEnd = sub.currentPeriodEnd;
    expect(firstPeriodEnd.toISOString()).toBe('2026-04-30T12:00:00.000Z');

    const commission = await prisma.commission.findUniqueOrThrow({
      where: { paymentId: firstPaymentId },
    });
    expect(commission.staffId).toBe(ana.staff.id);
    expect(commission.rate.toString()).toBe('0.1');
    expect(commission.amount.toString()).toBe('30');

    const settlement = await openSettlement(ana.staff.id);
    expect(settlement?.total.toString()).toBe('30');

    // Sin conexión con ANT, el envío queda pendiente con la fecha y el tope.
    const account = await prisma.productAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.accessUntil?.toISOString()).toBe(firstPeriodEnd.toISOString());
    expect(account.maxUsers).toBe(25);
    expect(account.accessPaymentId).toBe(firstPaymentId);
    expect(account.accessPushedAt).toBeNull();
    expect(account.lastPushError).toBeTruthy();
  });

  it('la misma referencia no duplica ni el pago ni la comisión', async () => {
    const res = await api(
      'payments/register',
      { subscriptionId, method: 'TRANSFER', externalRef: 'TRF-0001' },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: firstPaymentId, duplicate: true });
    expect(await prisma.payment.count({ where: { subscriptionId } })).toBe(1);
    expect(await prisma.commission.count({ where: { staffId: ana.staff.id } })).toBe(1);
  });

  it('pagar antes del vencimiento extiende desde el fin del período, sin perder días', async () => {
    const res = await api(
      'payments/register',
      { subscriptionId, method: 'CARD', externalRef: 'TRF-0002', paidAt: '2026-04-01T00:00:00Z' },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(new Date(res.body.data.periodStart).toISOString()).toBe(firstPeriodEnd.toISOString());
    expect(new Date(res.body.data.periodEnd).toISOString()).toBe('2026-07-30T12:00:00.000Z');
    expect((await openSettlement(ana.staff.id))?.total.toString()).toBe('60');
  });
});

describe('el asesor ve sus pagos y comisiones', () => {
  it('ve los pagos de su cliente con su comisión, y otro asesor no', async () => {
    const mine = await api('payments/list', { clientId }, ana.token);
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.data[0].commission.amount).toBe('30');

    const other = await api('payments/list', { clientId }, beto.token);
    expect(other.body.data).toHaveLength(0);
  });

  it('pedir las comisiones de otro asesor devuelve solo las propias', async () => {
    const res = await api('commissions/list', { staffId: ana.staff.id }, beto.token);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('cambiar el % no toca lo ya ganado', () => {
  it('las comisiones guardan el % con que se devengaron', async () => {
    await api('staff/update', { id: ana.staff.id, commissionRate: 0.2 }, admin.token);
    const old = await prisma.commission.findUniqueOrThrow({ where: { paymentId: firstPaymentId } });
    expect(old.rate.toString()).toBe('0.1');
    expect(old.amount.toString()).toBe('30');
    await api('staff/update', { id: ana.staff.id, commissionRate: 0.1 }, admin.token);
  });
});

describe('liquidación', () => {
  it('cerrar congela el total y marca las comisiones como liquidadas', async () => {
    const s = await openSettlement(ana.staff.id);
    const res = await api('settlements/close', { id: s!.id }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CLOSED', total: '60' });
    expect(
      await prisma.commission.count({ where: { settlementId: s!.id, status: 'SETTLED' } })
    ).toBe(2);

    // Ya no se puede volver a cerrar, y solo cerrada se puede marcar pagada.
    expect((await api('settlements/close', { id: s!.id }, admin.token)).status).toBe(400);
    const paid = await api(
      'settlements/mark-paid',
      { id: s!.id, notes: 'Transferencia 123' },
      admin.token
    );
    expect(paid.body.data.status).toBe('PAID');
  });

  it('el asesor ve su liquidación pero no puede cerrarla', async () => {
    const list = await api('settlements/list', {}, ana.token);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((s: any) => s.staff.id === ana.staff.id)).toBe(true);
    const s = list.body.data[0];
    expect((await api('settlements/close', { id: s.id }, ana.token)).status).toBe(403);
  });
});

describe('reembolso', () => {
  it('reembolsar un pago ya liquidado descuenta la comisión de la próxima liquidación', async () => {
    const res = await api(
      'payments/refund',
      { id: firstPaymentId, reason: 'Cobro doble' },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'REFUNDED', commissionStatus: 'REVERSED' });

    const next = await openSettlement(ana.staff.id);
    expect(next?.deductions.toString()).toBe('30');
    expect(next?.total.toString()).toBe('-30');

    // Un pago reembolsado no se reembolsa otra vez.
    expect(
      (await api('payments/refund', { id: firstPaymentId, reason: 'Otra vez' }, admin.token)).status
    ).toBe(400);
  });

  it('reembolsar un pago sin liquidar lo saca de la liquidación abierta', async () => {
    const pay = await api(
      'payments/register',
      { subscriptionId, method: 'TRANSFER', externalRef: 'TRF-0003' },
      admin.token
    );
    expect((await openSettlement(ana.staff.id))?.total.toString()).toBe('0'); // 30 - 30 de descuento

    await api(
      'payments/refund',
      { id: pay.body.data.id, reason: 'Error de registro' },
      admin.token
    );
    expect((await openSettlement(ana.staff.id))?.total.toString()).toBe('-30');
  });
});

describe('reasignación', () => {
  it('los pagos después de reasignar comisionan al nuevo asesor con su propio %', async () => {
    await api('clients/assign', { clientId, advisorId: beto.staff.id }, admin.token);
    const pay = await api(
      'payments/register',
      { subscriptionId, method: 'TRANSFER', externalRef: 'TRF-0004' },
      admin.token
    );
    const c = await prisma.commission.findUniqueOrThrow({ where: { paymentId: pay.body.data.id } });
    expect(c.staffId).toBe(beto.staff.id);
    expect(c.amount.toString()).toBe('15'); // 5% de 300

    // Lo que Ana ya ganó sigue siendo de Ana.
    const anaCommissions = await prisma.commission.count({ where: { staffId: ana.staff.id } });
    expect(anaCommissions).toBe(3);
  });
});

describe('cancelación y dashboard', () => {
  it('cancelada, ya no admite pagos', async () => {
    await api(
      'subscriptions/cancel',
      { id: subscriptionId, reason: 'Cerró la empresa' },
      admin.token
    );
    const res = await api('payments/register', { subscriptionId, method: 'CASH' }, admin.token);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('subscription.canceled');
  });

  it('el dashboard del admin cuenta los envíos de acceso pendientes', async () => {
    const res = await api('dashboard/summary', {}, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.pendingAccessPushes).toBeGreaterThanOrEqual(1);
    expect(res.body.data.subscriptions.CANCELED).toBeGreaterThanOrEqual(1);
  });
});
