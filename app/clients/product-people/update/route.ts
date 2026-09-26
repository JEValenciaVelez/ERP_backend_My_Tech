import { ErrorBadRequest } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
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
  userId: uuidSchema,
  name: z.string().trim().min(2).max(120).optional(),
  role: productRoleSchema.optional(),
  active: z.boolean().optional(),
  pin: productPinSchema.optional(),
});

/**
 * Edita a una persona: nombre, rol, PIN nuevo (p. ej. lo olvidó) o activarla
 * y desactivarla. Reactivar ocupa un cupo; el producto no deja a la empresa
 * sin administrador activo.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, userId, ...changes } = validateRequest({ schema, req });
  if (Object.values(changes).every((v) => v === undefined)) {
    throw new ErrorBadRequest({ code: 'validators.form.invalid' });
  }
  const account = await provisionedAccountFor(req.staff!, productAccountId);

  const { user } = await callService<{ user: ProductUser }>(
    account.product.code,
    'users/update',
    { tenantId: account.externalId, userId, ...changes },
    { notFound: 'productUser.notFound', errors: productUserErrors }
  );
  return response(res, req, next)({ user: toProductUser(user) });
}
