import { ANT_API_URL, ANT_SERVICE_TOKEN } from '@/config/env.config';
import Logger from '@/helpers/logger-pino';
import prisma from '@/models';

/**
 * Endpoint de servicio de cada producto. Hoy solo ANT tiene la conexión; los
 * demás quedan pendientes hasta que la tengan.
 */
function targetFor(productCode: string, path: 'access' | 'tenant/create') {
  if (productCode === 'ant' && ANT_API_URL && ANT_SERVICE_TOKEN) {
    return {
      url: `${ANT_API_URL.replace(/\/$/, '')}/api/v1/service/${path}`,
      token: ANT_SERVICE_TOKEN,
    };
  }
  return null;
}

export const canProvision = (productCode: string) => !!targetFor(productCode, 'tenant/create');

/**
 * Crea la empresa en el producto y su administrador. El producto es
 * idempotente por erpAccountId (el id de la ProductAccount): reintentar no
 * duplica. La contraseña temporal llega una sola vez y NO se guarda aquí.
 */
export async function provisionTenant(
  productCode: string,
  data: { erpAccountId: string; companyName: string; admin: { name: string; email: string } }
): Promise<{ tenantId: string; admin: { email: string; temporaryPassword: string } | null }> {
  const target = targetFor(productCode, 'tenant/create');
  if (!target) throw new Error('Sin conexión configurada con el producto');
  const res = await fetch(target.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.token}` },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: any = await res.json();
  return { tenantId: body.data.tenantId, admin: body.data.admin };
}

/**
 * "El ERP escribe la fecha, el producto la obedece." Envía accessUntil y
 * maxUsers al producto. El producto debe ser idempotente por paymentId y no
 * retroceder la fecha. Si falla, queda pendiente (accessPushedAt null) con el
 * error, y access/retry-pending lo reintenta. Nunca lanza: un producto caído
 * no puede tumbar el registro de un pago.
 */
export async function pushAccess(productAccountId: string) {
  const account = await prisma.productAccount.findUnique({
    where: { id: productAccountId },
    include: { product: true },
  });
  if (!account || !account.accessUntil || account.accessPushedAt) return { pushed: false };

  const target = targetFor(account.product.code, 'access');
  if (!target || !account.externalId) {
    const reason = !target ? 'Sin conexión configurada con el producto' : 'Cuenta sin aprovisionar';
    await prisma.productAccount.update({
      where: { id: account.id },
      data: { lastPushError: reason },
    });
    return { pushed: false, reason };
  }

  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.token}` },
      body: JSON.stringify({
        data: {
          tenantId: account.externalId,
          accessUntil: account.accessUntil.toISOString(),
          maxUsers: account.maxUsers,
          paymentId: account.accessPaymentId,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await prisma.productAccount.update({
      where: { id: account.id },
      data: { accessPushedAt: new Date(), lastPushError: null },
    });
    return { pushed: true };
  } catch (err: any) {
    Logger.logError({ error: err, method: 'pushAccess', path: target.url });
    await prisma.productAccount.update({
      where: { id: account.id },
      data: { lastPushError: String(err?.message || err).slice(0, 500) },
    });
    return { pushed: false, reason: String(err?.message || err) };
  }
}

/**
 * Aprovisiona una cuenta sin externalId: crea la empresa en el producto, guarda
 * su id y, si ya había una fecha de acceso pendiente (p. ej. un pago registrado
 * antes), la envía. Nunca lanza: devuelve el error para mostrarlo en el panel.
 */
export async function provisionAccount(
  productAccountId: string,
  admin: { name: string; email: string }
) {
  const account = await prisma.productAccount.findUniqueOrThrow({
    where: { id: productAccountId },
    include: { product: true, client: true },
  });
  if (account.externalId) return { provisioned: true, admin: null, error: null };
  try {
    const r = await provisionTenant(account.product.code, {
      erpAccountId: account.id,
      companyName: account.client.name,
      admin,
    });
    await prisma.productAccount.update({
      where: { id: account.id },
      data: { externalId: r.tenantId },
    });
    if (account.accessUntil && !account.accessPushedAt) await pushAccess(account.id);
    return { provisioned: true, admin: r.admin, error: null };
  } catch (err: any) {
    Logger.logError({ error: err, method: 'provisionAccount' });
    return { provisioned: false, admin: null, error: String(err?.message || err) };
  }
}
