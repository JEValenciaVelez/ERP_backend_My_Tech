import type { Staff } from '@prisma/client';
import { z } from 'zod';

/** Lo que se expone de una persona del staff: nunca el hash de la contraseña. */
export const toStaff = (s: Staff) => ({
  id: s.id,
  role: s.role,
  name: s.name,
  email: s.email,
  commissionRate: s.commissionRate,
  active: s.active,
  lastLoginAt: s.lastLoginAt,
  createdAt: s.createdAt,
});

export const roleSchema = z.enum(['ADMIN', 'ADVISOR', 'SYSTEMS'], {
  error: 'validators.form.invalid',
});

/** Entre 0 y 1 (0.1 = 10%), con 4 decimales como la columna. */
export const rateSchema = z
  .number({ error: 'validators.form.invalid' })
  .min(0, { error: 'validators.form.invalid' })
  .max(1, { error: 'validators.form.invalid' })
  .transform((n) => Math.round(n * 10000) / 10000);

export const nameSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z
    .string({ error: 'validators.form.invalid' })
    .min(2, { error: 'validators.form.invalid' })
    .max(120)
);
