import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { callService } from '@/app/access/access.shared';
import { provisionedAccountFor } from '@/app/clients/clients.shared';
import { ProductUser, toProductUser } from '@/app/clients/product-people/product-people.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';

const schema = z.object({ productAccountId: uuidSchema });

/** Personas de la empresa en el producto y cuántos cupos del plan ocupan. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productAccountId } = validateRequest({ schema, req });
  const account = await provisionedAccountFor(req.staff!, productAccountId);

  const data = await callService<{
    users: ProductUser[];
    seats: { active: number; max: number | null };
  }>(account.product.code, 'users/list', { tenantId: account.externalId });
  return response(
    res,
    req,
    next
  )({
    users: data.users.map(toProductUser),
    seats: { active: data.seats.active, max: data.seats.max },
  });
}
