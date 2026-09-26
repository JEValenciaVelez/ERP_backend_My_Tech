import { ErrorBadRequest, ErrorNotFound } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { assignOwner, staffSummary } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({ clientId: uuidSchema, advisorId: uuidSchema });

/**
 * Reasignar un cliente. La asignación anterior se cierra, no se borra: los
 * pagos ya cobrados siguen comisionados al asesor de entonces, y los que
 * entren desde ahora comisionan al nuevo.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { clientId, advisorId } = validateRequest({ schema, req });

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ErrorNotFound({ code: 'client.notFound' });

  const advisor = await prisma.staff.findUnique({ where: { id: advisorId } });
  if (!advisor || !advisor.active || advisor.role !== 'ADVISOR') {
    throw new ErrorBadRequest({ code: 'staff.advisor.notAdvisor' });
  }

  const a = await prisma.$transaction((tx) => assignOwner(clientId, advisorId, tx));
  return response(res, req, next)({ clientId, advisor: staffSummary(a.staff) });
}
