import { beforeAll, describe, expect, it } from 'vitest';

import { api, makeStaff, unique } from '@/test.helpers';

let admin: Awaited<ReturnType<typeof makeStaff>>;
let advisor: Awaited<ReturnType<typeof makeStaff>>;

beforeAll(async () => {
  admin = await makeStaff('ADMIN');
  advisor = await makeStaff('ADVISOR', 0.1);
});

describe('staff', () => {
  it('el admin crea un asesor con su % de comisión', async () => {
    const email = `${unique('nuevo')}@erp.test`;
    const res = await api(
      'staff/create',
      {
        role: 'ADVISOR',
        name: 'Carlos Comercial',
        email,
        password: 'clave-larga-1',
        commissionRate: 0.125,
      },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'ADVISOR', email, commissionRate: '0.125' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const dup = await api(
      'staff/create',
      { role: 'ADVISOR', name: 'Otro', email, password: 'clave-larga-1' },
      admin.token
    );
    expect(dup.status).toBe(409);
  });

  it('no deja poner % a quien no es asesor', async () => {
    const res = await api(
      'staff/create',
      {
        role: 'SYSTEMS',
        name: 'Sara Sistemas',
        email: `${unique('sys')}@erp.test`,
        password: 'clave-larga-1',
        commissionRate: 0.1,
      },
      admin.token
    );
    expect(res.status).toBe(400);
  });

  it('un asesor no puede crear staff ni ver el listado completo', async () => {
    const res = await api(
      'staff/create',
      {
        role: 'ADVISOR',
        name: 'Colado',
        email: `${unique('x')}@erp.test`,
        password: 'clave-larga-1',
      },
      advisor.token
    );
    expect(res.status).toBe(403);

    const list = await api('staff/list', {}, advisor.token);
    expect(list.status).toBe(200);
    expect(list.body.data.every((s: any) => s.role === 'SYSTEMS')).toBe(true);
  });

  it('el admin no puede desactivarse a sí mismo', async () => {
    const res = await api('staff/update', { id: admin.staff.id, active: false }, admin.token);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('staff.self.deactivate');
  });
});
