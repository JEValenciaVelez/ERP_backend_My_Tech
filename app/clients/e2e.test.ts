import { beforeAll, describe, expect, it } from 'vitest';

import prisma from '@/models';
import { api, makeStaff } from '@/test.helpers';

let admin: Awaited<ReturnType<typeof makeStaff>>;
let ana: Awaited<ReturnType<typeof makeStaff>>;
let beto: Awaited<ReturnType<typeof makeStaff>>;
let systems: Awaited<ReturnType<typeof makeStaff>>;
let anaClientId: string;

beforeAll(async () => {
  admin = await makeStaff('ADMIN');
  ana = await makeStaff('ADVISOR', 0.1);
  beto = await makeStaff('ADVISOR', 0.08);
  systems = await makeStaff('SYSTEMS');
});

describe('clientes: afiliación y alcance', () => {
  it('el asesor que afilia una empresa queda como su titular', async () => {
    const res = await api(
      'clients/create',
      {
        name: 'Eléctricos del Norte',
        contactName: 'Laura',
        email: 'LAURA@norte.test',
        taxId: '900111222',
      },
      ana.token
    );
    expect(res.status).toBe(200);
    anaClientId = res.body.data.id;

    const owner = await prisma.clientAssignment.findFirst({
      where: { clientId: anaClientId, endedAt: null },
    });
    expect(owner?.staffId).toBe(ana.staff.id);
  });

  it('el asesor ve sus clientes y no los de otro', async () => {
    const mine = await api('clients/list', {}, ana.token);
    expect(mine.body.data.map((c: any) => c.id)).toContain(anaClientId);

    const theirs = await api('clients/list', {}, beto.token);
    expect(theirs.body.data.map((c: any) => c.id)).not.toContain(anaClientId);
  });

  it('otro asesor recibe 404 al pedir, editar o abrir ticket de un cliente ajeno', async () => {
    expect((await api('clients/get', { id: anaClientId }, beto.token)).status).toBe(404);
    expect((await api('clients/update', { id: anaClientId, phone: '1' }, beto.token)).status).toBe(
      404
    );
    expect(
      (
        await api(
          'tickets/create',
          { clientId: anaClientId, subject: 'Hola', description: 'Algo pasa' },
          beto.token
        )
      ).status
    ).toBe(404);
  });

  it('sistemas no navega clientes', async () => {
    expect((await api('clients/list', {}, systems.token)).status).toBe(403);
  });

  it('el admin debe elegir asesor, y solo puede ser un asesor activo', async () => {
    expect((await api('clients/create', { name: 'Sin Asesor SA' }, admin.token)).status).toBe(400);
    const res = await api(
      'clients/create',
      { name: 'Con Sistemas SA', advisorId: systems.staff.id },
      admin.token
    );
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('staff.advisor.notAdvisor');
  });

  it('rechaza un NIT repetido', async () => {
    const res = await api('clients/create', { name: 'Copia', taxId: '900111222' }, ana.token);
    expect(res.status).toBe(409);
  });

  it('reasignar pasa la cartera: el nuevo lo ve, el anterior deja de verlo, y queda el historial', async () => {
    const res = await api(
      'clients/assign',
      { clientId: anaClientId, advisorId: beto.staff.id },
      admin.token
    );
    expect(res.status).toBe(200);

    expect((await api('clients/get', { id: anaClientId }, beto.token)).status).toBe(200);
    expect((await api('clients/get', { id: anaClientId }, ana.token)).status).toBe(404);

    const detail = await api('clients/get', { id: anaClientId }, admin.token);
    expect(detail.body.data.advisor.id).toBe(beto.staff.id);
    expect(detail.body.data.assignments).toHaveLength(2);
    expect(
      detail.body.data.assignments.find((a: any) => a.staff.id === ana.staff.id).endedAt
    ).toBeTruthy();
  });

  it('vincular a ANT abre la cuenta sin aprovisionar, una sola vez', async () => {
    await prisma.product.upsert({
      where: { code: 'ant' },
      update: {},
      create: { code: 'ant', name: 'ANT' },
    });
    const res = await api(
      'clients/link-product',
      { clientId: anaClientId, productCode: 'ant' },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data.externalId).toBeNull();

    const again = await api(
      'clients/link-product',
      { clientId: anaClientId, productCode: 'ant' },
      admin.token
    );
    expect(again.status).toBe(409);
  });
});
