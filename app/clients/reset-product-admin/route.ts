import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { emailSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { resetTenantAdmin } from '@/app/access/access.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  productAccountId: uuidSchema,
  // Solo hace falta si la empresa tiene varios administradores.
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() || undefined : v),
    emailSchema.optional()
  ),
});

/**
 * El administrador de la empresa perdió su contraseña del producto. El admin
 * del ERP genera una temporal nueva y se la entrega; se muestra una sola vez.
 * Sus dispositivos ya autorizados siguen funcionando.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, email } = validateRequest({ schema, req });

  const account = await prisma.productAccount.findUnique({
    where: { id: productAccountId },
    include: { product: true },
  });
  if (!account) throw new ErrorNotFound({ code: 'productAccount.notFound' });
  if (!account.externalId) throw new ErrorBadRequest({ code: 'product.notProvisioned' });

  const admin = await resetTenantAdmin(account.product.code, account.externalId, email);
  return response(res, req, next)({ admin });
}
