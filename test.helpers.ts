import request from 'supertest';

import { hashSecret, signAccess, StaffRoleName } from '@/helpers/auth';
import prisma from '@/models';

const getApp = () => (globalThis as any).app;

let seq = 0;
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** POST al API con el sobre { data } y, si se da, el token del staff. */
export const api = (path: string, data: unknown = {}, token?: string) => {
  const req = request(getApp()).post(`/api/v1/${path}`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send({ data });
};

export async function makeStaff(role: StaffRoleName, commissionRate?: number) {
  const staff = await prisma.staff.create({
    data: {
      role,
      name: `${role} ${seq + 1}`,
      email: `${unique(role.toLowerCase())}@erp.test`,
      passwordHash: await hashSecret('clave-de-prueba'),
      commissionRate: commissionRate ?? null,
    },
  });
  return { staff, token: signAccess({ staffId: staff.id, role }) };
}

export async function antProduct() {
  return prisma.product.upsert({
    where: { code: 'ant' },
    update: {},
    create: { code: 'ant', name: 'ANT' },
  });
}

export async function makePlan(
  interval: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY',
  amount: number,
  maxUsers: number | null = 10
) {
  const product = await antProduct();
  return prisma.plan.create({
    data: {
      productId: product.id,
      name: unique('Plan'),
      tier: unique('tier'),
      maxUsers,
      amount,
      currency: 'USD',
      interval,
    },
  });
}

export { unique };
