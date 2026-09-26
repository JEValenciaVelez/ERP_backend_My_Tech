import { emailSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { callService } from '@/app/access/access.shared';
import { provisionedAccountFor } from '@/app/clients/clients.shared';
import {
  productPinSchema,
  productRoleSchema,
  ProductUser,
  productUserErrors,
  toProductUser,
} from '@/app/clients/product-people/product-people.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';

const schema = z.object({
  productAccountId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  role: productRoleSchema,
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() || undefined : (v ?? undefined)),
    emailSchema.optional()
  ),
  phone: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || undefined : (v ?? undefined)),
    z.string().max(30).optional()
  ),
  // Quien opera en la app entra con PIN: sin él no podría usarla.
  pin: productPinSchema,
});

/** Alta de una persona que opera en el producto. Ocupa un cupo del plan. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, ...data } = validateRequest({ schema, req });
  const account = await provisionedAccountFor(req.staff!, productAccountId);

  const { user } = await callService<{ user: ProductUser }>(
    account.product.code,
    'users/create',
    { tenantId: account.externalId, ...data },
    { errors: productUserErrors }
  );
  return response(res, req, next)({ user: toProductUser(user) });
}
