import { ANT_API_URL, ANT_SERVICE_TOKEN } from '@/config/env.config';
import Logger from '@/helpers/logger-pino';
import prisma from '@/models';

/**
 * Adónde se envía el acceso de cada producto. Hoy solo ANT tiene la conexión;
 * los demás quedan pendientes hasta que la tengan.
 */
function targetFor(productCode: string) {
  if (productCode === 'ant' && ANT_API_URL && ANT_SERVICE_TOKEN) {
    return {
      url: `${ANT_API_URL.replace(/\/$/, '')}/api/v1/service/access`,
      token: ANT_SERVICE_TOKEN,
    };
  }
  return null;
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

  const target = targetFor(account.product.code);
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
