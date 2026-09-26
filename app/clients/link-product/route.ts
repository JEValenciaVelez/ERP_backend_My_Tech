import { ErrorConflict, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  clientId: uuidSchema,
  productCode: z.string({ error: 'validators.form.invalid' }),
  externalId: z.string().trim().min(1).max(191).nullable().optional(),
});

/**
 * Abre la cuenta del cliente en un producto. externalId es el id del tenant en
 * ese producto; puede quedar vacío hasta que el producto lo aprovisione.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { clientId, productCode, externalId } = validateRequest({ schema, req });

  const [client, product] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.product.findUnique({ where: { code: productCode } }),
  ]);
  if (!client) throw new ErrorNotFound({ code: 'client.notFound' });
  if (!product) throw new ErrorNotFound({ code: 'product.notFound' });

  const existing = await prisma.productAccount.findFirst({
    where: { clientId, productId: product.id },
  });
  if (existing) throw new ErrorConflict({ code: 'client.product.linked' });

  const account = await prisma.productAccount.create({
    data: { clientId, productId: product.id, externalId: externalId ?? null },
  });
  return response(
    res,
    req,
    next
  )({ id: account.id, product: product.code, externalId: account.externalId });
}
