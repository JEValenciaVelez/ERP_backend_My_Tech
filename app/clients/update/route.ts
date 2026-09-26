import { ErrorConflict } from 'config/errors';
import { uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { clientFields } from '@/app/clients/clients.schemas';
import { assertClientVisible } from '@/app/clients/clients.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  id: uuidSchema,
  ...z.object(clientFields).partial().shape,
  active: z.boolean().optional(),
});

/** Datos de contacto: el asesor los mantiene al día para sus clientes. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { id, active, ...data } = validateRequest({ schema, req });
  const me = req.staff!;
  await assertClientVisible(me, id);

  if (data.taxId) {
    const dup = await prisma.client.findFirst({ where: { taxId: data.taxId, id: { not: id } } });
    if (dup) throw new ErrorConflict({ code: 'client.taxId.exists' });
  }

  // Dar de baja a un cliente es una decisión comercial: solo admin.
  const updated = await prisma.client.update({
    where: { id },
    data: { ...data, ...(me.role === 'ADMIN' && active !== undefined ? { active } : {}) },
  });
  return response(res, req, next)({ id: updated.id, name: updated.name, active: updated.active });
}
