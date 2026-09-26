import { emailSchema } from 'config/validation/generalSchemas';
import { z } from 'zod';

import { nameSchema } from '@/app/staff/staff.shared';

const trimmedOptional = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || null : v),
    z.string({ error: 'validators.form.invalid' }).max(max).nullable().optional()
  );

export const clientFields = {
  name: nameSchema,
  contactName: trimmedOptional(120),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() || null : v),
    emailSchema.nullable().optional()
  ),
  phone: trimmedOptional(30),
  taxId: trimmedOptional(30),
};

/** Administrador de la empresa en un producto (lo crea el aprovisionamiento). */
export const adminSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), emailSchema),
  })
  .optional();
