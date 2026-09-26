import { ErrorBadRequest, ErrorConflict } from 'config/errors';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { clientFields } from '@/app/clients/clients.schemas';
import { assignOwner } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ ...clientFields, advisorId: z.uuid().optional() });

/**
 * Afiliar una empresa. El asesor que la crea queda como su titular (así nace
 * su comisión); el admin elige a qué asesor asignarla.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { advisorId, ...data } = validateRequest({ schema, req });
  const me = req.staff!;

  const ownerId = me.role === 'ADVISOR' ? me.id : advisorId;
  if (!ownerId) throw new ErrorBadRequest({ code: 'client.advisorRequired' });

  const owner = await prisma.staff.findUnique({ where: { id: ownerId } });
  if (!owner || !owner.active || owner.role !== 'ADVISOR') {
    throw new ErrorBadRequest({ code: 'staff.advisor.notAdvisor' });
  }

  if (data.taxId) {
    const dup = await prisma.client.findUnique({ where: { taxId: data.taxId } });
    if (dup) throw new ErrorConflict({ code: 'client.taxId.exists' });
  }

  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.client.create({ data });
    await assignOwner(c.id, ownerId, tx);
    return c;
  });

  return response(res, req, next)({ id: client.id, name: client.name });
}
