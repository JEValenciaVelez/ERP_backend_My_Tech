import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { callService } from '@/app/access/access.shared';
import { provisionedAccountFor } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';

const schema = z.object({ productAccountId: uuidSchema, deviceId: uuidSchema });

/** Un teléfono perdido o robado: el producto corta en el acto sus sesiones. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId, deviceId } = validateRequest({ schema, req });
  const account = await provisionedAccountFor(req.staff!, productAccountId);

  await callService(
    account.product.code,
    'devices/revoke',
    { tenantId: account.externalId, deviceId },
    { notFound: 'productDevice.notFound' }
  );
  return response(res, req, next)({ deviceId, revoked: true });
}
