import { beforeAll, describe, expect, it } from 'vitest';

import { api, makeStaff } from '@/test.helpers';

let ana: Awaited<ReturnType<typeof makeStaff>>;
let beto: Awaited<ReturnType<typeof makeStaff>>;
let sara: Awaited<ReturnType<typeof makeStaff>>;
let tomas: Awaited<ReturnType<typeof makeStaff>>;
let clientId: string;
let ticketId: string;

beforeAll(async () => {
  ana = await makeStaff('ADVISOR', 0.1);
  beto = await makeStaff('ADVISOR', 0.1);
  sara = await makeStaff('SYSTEMS');
  tomas = await makeStaff('SYSTEMS');
  clientId = (await api('clients/create', { name: 'Cables y Tubos' }, ana.token)).body.data.id;
});

describe('soporte: asesor de primera línea, sistemas al escalar', () => {
  it('el asesor abre el ticket de su cliente', async () => {
    const res = await api(
      'tickets/create',
      {
        clientId,
        subject: 'No les llegan las órdenes',
        description: 'El almacén dice que no ve los pedidos',
        channel: 'PHONE',
      },
      ana.token
    );
    expect(res.status).toBe(200);
    ticketId = res.body.data.id;
  });

  it('comentar lo pone en curso y marca la primera respuesta', async () => {
    await api('tickets/comment', { id: ticketId, body: 'Revisando con el cliente' }, ana.token);
    const t = await api('tickets/get', { id: ticketId }, ana.token);
    expect(t.body.data.status).toBe('IN_PROGRESS');
    expect(t.body.data.firstResponseAt).toBeTruthy();
  });

  it('sistemas no ve el ticket hasta que se lo escalan', async () => {
    expect((await api('tickets/get', { id: ticketId }, sara.token)).status).toBe(404);
  });

  it('solo se escala a alguien de sistemas, con el requerimiento depurado', async () => {
    const wrong = await api(
      'tickets/escalate',
      { id: ticketId, systemsStaffId: beto.staff.id, requirement: 'x'.repeat(10) },
      ana.token
    );
    expect(wrong.status).toBe(400);

    const res = await api(
      'tickets/escalate',
      {
        id: ticketId,
        systemsStaffId: sara.staff.id,
        requirement: 'Las órdenes de 7 Fairfield Rd no aparecen en el almacén desde ayer',
        priority: 'HIGH',
      },
      ana.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ESCALATED');
  });

  it('la persona de sistemas asignada lo ve con el requerimiento; otra de sistemas no', async () => {
    const list = await api('tickets/list', {}, sara.token);
    expect(list.body.data.map((t: any) => t.id)).toContain(ticketId);

    const t = await api('tickets/get', { id: ticketId }, sara.token);
    expect(t.body.data.priority).toBe('HIGH');
    expect(t.body.data.comments.some((c: any) => c.internal && /Fairfield/.test(c.body))).toBe(
      true
    );

    expect((await api('tickets/get', { id: ticketId }, tomas.token)).status).toBe(404);
  });

  it('otro asesor no ve el ticket', async () => {
    expect((await api('tickets/get', { id: ticketId }, beto.token)).status).toBe(404);
  });

  it('sistemas resuelve, el asesor verifica y cierra', async () => {
    expect((await api('tickets/close', { id: ticketId }, ana.token)).status).toBe(400); // aún no resuelto
    const resolved = await api(
      'tickets/resolve',
      { id: ticketId, note: 'Corregido el filtro de proyecto' },
      sara.token
    );
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect((await api('tickets/close', { id: ticketId }, sara.token)).status).toBe(403); // sistemas no cierra
    const closed = await api('tickets/close', { id: ticketId }, ana.token);
    expect(closed.body.data.status).toBe('CLOSED');
  });

  it('reabrir lo devuelve a sistemas y cuenta la reapertura', async () => {
    const res = await api(
      'tickets/reopen',
      { id: ticketId, reason: 'Volvió a pasar hoy' },
      ana.token
    );
    expect(res.body.data.status).toBe('ESCALATED');
    const t = await api('tickets/get', { id: ticketId }, ana.token);
    expect(t.body.data.reopenCount).toBe(1);
  });
});
