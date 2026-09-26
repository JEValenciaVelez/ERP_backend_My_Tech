import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { canProvision, provisionAccount } from '@/app/access/access.shared';
import { adminSchema } from '@/app/clients/clients.schemas';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ productAccountId: uuidSchema, admin: adminSchema });

/** Reintenta crear la empresa en el producto cuando falló al vincularla. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, admin } = validateRequest({ schema, req });
  const account = await prisma.productAccount.findUnique({
    where: { id: productAccountId },
    include: { product: true, client: true },
  });
  if (!account) throw new ErrorNotFound({ code: 'productAccount.notFound' });
  if (!canProvision(account.product.code))
    throw new ErrorBadRequest({ code: 'product.notConnected' });

  const c = account.client;
  const adminData = admin ?? (c.email ? { name: c.contactName || c.name, email: c.email } : null);
  if (!adminData) throw new ErrorBadRequest({ code: 'client.adminEmailRequired' });

  return response(res, req, next)(await provisionAccount(account.id, adminData));
}
