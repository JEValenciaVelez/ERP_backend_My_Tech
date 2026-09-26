import { ErrorBadRequest, ErrorConflict, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { canProvision, provisionAccount } from '@/app/access/access.shared';
import { adminSchema } from '@/app/clients/clients.schemas';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  clientId: uuidSchema,
  productCode: z.string({ error: 'validators.form.invalid' }),
  externalId: z.string().trim().min(1).max(191).nullable().optional(),
  // Administrador de la empresa en el producto. Por defecto, el contacto del cliente.
  admin: adminSchema,
});

/**
 * Abre la cuenta del cliente en un producto. Si el producto está conectado
 * (hoy ANT) y no se da externalId, la empresa se crea allá en el acto y la
 * contraseña temporal del administrador se devuelve UNA vez para entregársela.
 * Si el producto no responde, la cuenta queda sin aprovisionar y se reintenta
 * con clients/provision.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { clientId, productCode, externalId, admin } = validateRequest({ schema, req });

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

  if (externalId) {
    const taken = await prisma.productAccount.findFirst({
      where: { productId: product.id, externalId },
    });
    if (taken) throw new ErrorConflict({ code: 'client.product.linked' });
  }

  const provision = !externalId && canProvision(productCode);
  const adminData =
    admin ??
    (client.email ? { name: client.contactName || client.name, email: client.email } : null);
  if (provision && !adminData) throw new ErrorBadRequest({ code: 'client.adminEmailRequired' });

  const account = await prisma.productAccount.create({
    data: { clientId, productId: product.id, externalId: externalId ?? null },
  });

  const result = provision ? await provisionAccount(account.id, adminData!) : null;
  const fresh = await prisma.productAccount.findUniqueOrThrow({ where: { id: account.id } });

  return response(
    res,
    req,
    next
  )({
    id: fresh.id,
    product: product.code,
    externalId: fresh.externalId,
    provisioning: result,
  });
}
