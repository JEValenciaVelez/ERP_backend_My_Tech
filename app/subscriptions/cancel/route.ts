import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ id: uuidSchema, reason: textareaSchema.min(3) });

/**
 * Baja. El cliente conserva el acceso hasta el final del período que ya pagó:
 * accessUntil no se toca, simplemente no se vuelve a extender.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, reason } = validateRequest({ schema, req });

  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) throw new ErrorNotFound({ code: 'subscription.notFound' });
  if (sub.status === 'CANCELED') throw new ErrorBadRequest({ code: 'subscription.canceled' });

  const updated = await prisma.subscription.update({
    where: { id },
    data: { status: 'CANCELED', canceledAt: new Date(), cancelReason: reason },
  });
  return response(res, req, next)({ id: updated.id, status: updated.status });
}
