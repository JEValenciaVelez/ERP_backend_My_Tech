import type { Plan, Product } from '@prisma/client';
import { z } from 'zod';

export const intervalSchema = z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'], {
  error: 'validators.form.invalid',
});

export const amountSchema = z
  .number({ error: 'validators.amount.invalid' })
  .positive({ error: 'validators.amount.invalid' })
  .max(1_000_000_000_000, { error: 'validators.amount.invalid' })
  .transform((n) => Math.round(n * 100) / 100);

export const currencySchema = z
  .string({ error: 'validators.form.invalid' })
  .regex(/^[A-Z]{3}$/, { error: 'validators.form.invalid' });

export const maxUsersSchema = z
  .number({ error: 'validators.form.invalid' })
  .int({ error: 'validators.form.invalid' })
  .positive({ error: 'validators.form.invalid' })
  .nullable();

export const toPlan = (p: Plan & { product?: Product }) => ({
  id: p.id,
  productId: p.productId,
  productCode: p.product?.code,
  name: p.name,
  tier: p.tier,
  maxUsers: p.maxUsers,
  amount: p.amount,
  currency: p.currency,
  interval: p.interval,
  active: p.active,
});
