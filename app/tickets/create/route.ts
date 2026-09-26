import { ErrorNotFound } from 'config/errors';
import { textareaSchema, uuidSchema } from 'config/validation/generalSchemas';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { assertClientVisible } from '@/app/clients/clients.shared';
import { nameSchema } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  clientId: uuidSchema,
  productCode: z.string().optional(),
  subject: nameSchema,
  description: textareaSchema.min(3, { error: 'validators.form.invalid' }),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  channel: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON', 'APP']).optional(),
});

/** El asesor registra lo que el cliente le pidió; queda como responsable. */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { clientId, productCode, ...data } = validateRequest({ schema, req });
  const me = req.staff!;
  await assertClientVisible(me, clientId);

  let productAccountId: string | null = null;
  if (productCode) {
    const account = await prisma.productAccount.findFirst({
      where: { clientId, product: { code: productCode } },
    });
    if (!account) throw new ErrorNotFound({ code: 'productAccount.notFound' });
    productAccountId = account.id;
  }

  const t = await prisma.ticket.create({
    data: { clientId, productAccountId, ownerId: me.id, ...data },
  });
  return response(res, req, next)({ id: t.id, status: t.status });
}
