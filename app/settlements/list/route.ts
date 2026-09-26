import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { toSettlement } from '@/app/settlements/settlements.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  staffId: z.uuid().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'PAID']).optional(),
});

export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { staffId, status } = validateRequest({ schema, req });
  const me = req.staff!;
  const owner = me.role === 'ADMIN' ? staffId : me.id;

  const settlements = await prisma.settlement.findMany({
    where: { ...(owner ? { staffId: owner } : {}), ...(status ? { status } : {}) },
    include: { staff: { select: { id: true, name: true } } },
    orderBy: [{ periodStart: 'desc' }],
  });
  return response(res, req, next)(settlements.map(toSettlement));
}
