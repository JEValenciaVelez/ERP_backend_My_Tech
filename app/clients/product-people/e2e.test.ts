import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import prisma from '@/models';
import { antProduct, api, makeStaff } from '@/test.helpers';

let originalApp: unknown;

let admin: Awaited<ReturnType<typeof makeStaff>>;
let ana: Awaited<ReturnType<typeof makeStaff>>;
let beto: Awaited<ReturnType<typeof makeStaff>>;
let accountId: string;
let unprovisionedId: string;
const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';

const antUser = {
  id: userId,
  name: 'Pedro',
  role: 'FOREMAN',
  isCompanyAdmin: false,
  email: null,
  phone: '3001234567',
  active: true,
  hasPin: true,
  mustChangePin: true,
  lastLoginAt: null,
  brandPrefs: { secreto: true },
};

/** Responde como ANT y guarda lo que el ERP le envió. */
function antReplies(status: number, body: unknown) {
  const calls: { url: string; auth: string; data: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: (init.headers as Record<string, string>).Authorization,
        data: JSON.parse(String(init.body)).data,
      });
      return new Response(JSON.stringify(body), { status });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Conexión con ANT solo en este archivo: la app se vuelve a armar con el env
// simulado (el setup ya la armó sin conexión). fetch se reemplaza en cada prueba.
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('@/config/env.config', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ANT_API_URL: 'http://ant.test',
    ANT_SERVICE_TOKEN: 'token-de-servicio',
  }));
  const { default: Server } = await import('@/server');
  originalApp = (globalThis as any).app;
  (globalThis as any).app = new Server().createApp();
});

afterAll(async () => {
  (globalThis as any).app = originalApp;
  vi.doUnmock('@/config/env.config');
  const { default: freshPrisma } = await import('@/models');
  await freshPrisma.$disconnect();
});

beforeAll(async () => {
  admin = await makeStaff('ADMIN');
  ana = await makeStaff('ADVISOR', 0.1);
  beto = await makeStaff('ADVISOR', 0.08);
  const product = await antProduct();

  const makeClient = async (name: string) => {
    const res = await api('clients/create', { name }, ana.token);
    return res.body.data.id as string;
  };
  const provisioned = await prisma.productAccount.create({
    data: {
      clientId: await makeClient('Obras Pedro'),
      productId: product.id,
      externalId: tenantId,
    },
  });
  const pending = await prisma.productAccount.create({
    data: { clientId: await makeClient('Obras sin crear'), productId: product.id },
  });
  accountId = provisioned.id;
  unprovisionedId = pending.id;
});

describe('gente y dispositivos de la empresa en el producto', () => {
  it('el asesor del cliente lista la gente y los cupos, sin campos de más', async () => {
    const calls = antReplies(200, { data: { users: [antUser], seats: { active: 3, max: 5 } } });
    const res = await api(
      'clients/product-people/list',
      { productAccountId: accountId },
      ana.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data.seats).toEqual({ active: 3, max: 5 });
    expect(res.body.data.users[0].name).toBe('Pedro');
    expect(res.body.data.users[0].brandPrefs).toBeUndefined();
    expect(calls[0].url).toBe('http://ant.test/api/v1/service/users/list');
    expect(calls[0].auth).toBe('Bearer token-de-servicio');
    expect(calls[0].data).toEqual({ tenantId });
  });

  it('un asesor ajeno recibe 404 y no se llama al producto', async () => {
    const calls = antReplies(200, { data: {} });
    for (const [path, data] of [
      ['clients/product-people/list', {}],
      ['clients/product-people/create', { name: 'X Y', role: 'FOREMAN', pin: '1234' }],
      ['clients/product-people/update', { userId, active: false }],
      ['clients/product-devices/list', {}],
      ['clients/product-devices/revoke', { deviceId }],
    ] as const) {
      const res = await api(path, { productAccountId: accountId, ...data }, beto.token);
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('client.notFound');
    }
    expect(calls).toHaveLength(0);
  });

  it('sin la cuenta aprovisionada: 400 product.notProvisioned', async () => {
    antReplies(200, { data: {} });
    const res = await api(
      'clients/product-people/list',
      { productAccountId: unprovisionedId },
      ana.token
    );
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('product.notProvisioned');
  });

  it('alta: envía los datos al producto y traduce el tope del plan a 409', async () => {
    const calls = antReplies(200, { data: { user: antUser } });
    const ok = await api(
      'clients/product-people/create',
      { productAccountId: accountId, name: ' Pedro ', role: 'FOREMAN', phone: '', pin: '1234' },
      ana.token
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.id).toBe(userId);
    expect(calls[0].data).toEqual({ tenantId, name: 'Pedro', role: 'FOREMAN', pin: '1234' });

    antReplies(409, { errorCode: 'company.userLimit' });
    const full = await api(
      'clients/product-people/create',
      { productAccountId: accountId, name: 'Otro', role: 'APPRENTICE', pin: '1234' },
      admin.token
    );
    expect(full.status).toBe(409);
    expect(full.body.errorCode).toBe('productUser.limit');
  });

  it('alta sin PIN de 4 dígitos: 400 sin llamar al producto', async () => {
    const calls = antReplies(200, { data: { user: antUser } });
    const res = await api(
      'clients/product-people/create',
      { productAccountId: accountId, name: 'Pedro', role: 'FOREMAN', pin: '12' },
      ana.token
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('editar: 404 si la persona no es de la empresa; no deja a la empresa sin admin', async () => {
    antReplies(404, { errorCode: 'user.notFound' });
    const missing = await api(
      'clients/product-people/update',
      { productAccountId: accountId, userId, name: 'Pedro P' },
      ana.token
    );
    expect(missing.status).toBe(404);
    expect(missing.body.errorCode).toBe('productUser.notFound');

    antReplies(400, { errorCode: 'user.lastAdmin' });
    const last = await api(
      'clients/product-people/update',
      { productAccountId: accountId, userId, active: false },
      ana.token
    );
    expect(last.status).toBe(400);
    expect(last.body.errorCode).toBe('productUser.lastAdmin');
  });

  it('editar sin cambios: 400', async () => {
    const res = await api(
      'clients/product-people/update',
      { productAccountId: accountId, userId },
      ana.token
    );
    expect(res.status).toBe(400);
  });

  it('dispositivos: lista y revoca', async () => {
    const device = {
      id: deviceId,
      name: 'Tablet bodega',
      createdBy: { id: userId, name: 'Pedro' },
      createdAt: '2026-09-01T00:00:00.000Z',
      lastSeenAt: null,
      revokedAt: null,
    };
    antReplies(200, { data: { devices: [device] } });
    const list = await api(
      'clients/product-devices/list',
      { productAccountId: accountId },
      ana.token
    );
    expect(list.status).toBe(200);
    expect(list.body.data.devices).toEqual([device]);

    const calls = antReplies(200, { data: { id: deviceId, revoked: true } });
    const res = await api(
      'clients/product-devices/revoke',
      { productAccountId: accountId, deviceId },
      ana.token
    );
    expect(res.body.data).toEqual({ deviceId, revoked: true });
    expect(calls[0].data).toEqual({ tenantId, deviceId });
  });

  it('producto caído, 5xx o empresa inexistente en el producto: 502 product.unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    const down = await api(
      'clients/product-devices/list',
      { productAccountId: accountId },
      ana.token
    );
    expect(down.status).toBe(502);
    expect(down.body.errorCode).toBe('product.unavailable');

    antReplies(500, { errorCode: 'server.error' });
    expect(
      (await api('clients/product-people/list', { productAccountId: accountId }, ana.token)).status
    ).toBe(502);

    antReplies(404, { errorCode: 'company.notFound' });
    expect(
      (
        await api(
          'clients/product-devices/revoke',
          { productAccountId: accountId, deviceId },
          ana.token
        )
      ).status
    ).toBe(502);
  });
});
