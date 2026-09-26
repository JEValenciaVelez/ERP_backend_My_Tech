import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { toPlan } from '@/app/plans/plans.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  productCode: z.string().optional(),
  includeInactive: z.boolean().optional(),
});

const INTERVAL_ORDER = { MONTHLY: 0, QUARTERLY: 1, SEMIANNUAL: 2, YEARLY: 3 } as const;

export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productCode, includeInactive } = validateRequest({ schema, req });
  const plans = await prisma.plan.findMany({
    where: {
      ...(productCode ? { product: { code: productCode } } : {}),
      ...(includeInactive && req.staff!.role === 'ADMIN' ? {} : { active: true }),
    },
    include: { product: true },
    orderBy: [{ productId: 'asc' }, { amount: 'asc' }],
  });
  plans.sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      a.tier.localeCompare(b.tier) ||
      INTERVAL_ORDER[a.interval] - INTERVAL_ORDER[b.interval]
  );
  return response(res, req, next)(plans.map(toPlan));
}
