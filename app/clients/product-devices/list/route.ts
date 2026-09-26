import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { callService } from '@/app/access/access.shared';
import { provisionedAccountFor } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';

const schema = z.object({ productAccountId: uuidSchema });

type ProductDevice = {
  id: string;
  name: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

/** Teléfonos y tablets que los administradores de la empresa autorizaron. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId } = validateRequest({ schema, req });
  const account = await provisionedAccountFor(req.staff!, productAccountId);

  const { devices } = await callService<{ devices: ProductDevice[] }>(
    account.product.code,
    'devices/list',
    { tenantId: account.externalId }
  );
  return response(
    res,
    req,
    next
  )({
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      createdBy: d.createdBy ? { id: d.createdBy.id, name: d.createdBy.name } : null,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      revokedAt: d.revokedAt,
    })),
  });
}
