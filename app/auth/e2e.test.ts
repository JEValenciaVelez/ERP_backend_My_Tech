import { beforeAll, describe, expect, it } from 'vitest';

import { hashSecret } from '@/helpers/auth';
import prisma from '@/models';
import { api, unique } from '@/test.helpers';

let email: string;

beforeAll(async () => {
  email = `${unique('login')}@erp.test`;
  await prisma.staff.create({
    data: {
      role: 'ADVISOR',
      name: 'Ana Asesora',
      email,
      passwordHash: await hashSecret('clave-segura-1'),
    },
  });
});

describe('auth', () => {
  it('entra con email y contraseña, sin exponer el hash', async () => {
    const res = await api('auth/login', {
      email: `  ${email.toUpperCase()} `,
      password: 'clave-segura-1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.staff).toMatchObject({ email, role: 'ADVISOR' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const me = await api('auth/me', {}, res.body.data.accessToken);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });

  it('rechaza una contraseña incorrecta con el mismo error que un email inexistente', async () => {
    const bad = await api('auth/login', { email, password: 'otra-clave' });
    const none = await api('auth/login', { email: 'nadie@erp.test', password: 'otra-clave' });
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect(bad.body.errorCode).toBe(none.body.errorCode);
  });

  it('un token deja de servir si desactivan a la persona', async () => {
    const login = await api('auth/login', { email, password: 'clave-segura-1' });
    await prisma.staff.update({ where: { email }, data: { active: false } });
    const me = await api('auth/me', {}, login.body.data.accessToken);
    expect(me.status).toBe(403);
    expect(me.body.errorCode).toBe('auth.user.blocked');
    await prisma.staff.update({ where: { email }, data: { active: true } });
  });

  it('frena el ritmo de fallos por email con 429 y Retry-After', async () => {
    const target = `${unique('fuerza')}@erp.test`;
    for (let i = 0; i < 10; i++) {
      const r = await api('auth/login', { email: target, password: `mala-${i}` });
      expect(r.status).toBe(401);
    }
    const blocked = await api('auth/login', { email: target, password: 'otra-mala' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorCode).toBe('auth.demasiadosIntentos');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('pide el sobre { data }', async () => {
    const res = await api('auth/me', undefined as any);
    expect([400, 401]).toContain(res.status);
  });
});
