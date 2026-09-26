import { ErrorConflict, ErrorNotFound } from 'config/errors';
import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import {
  amountSchema,
  currencySchema,
  intervalSchema,
  maxUsersSchema,
  toPlan,
} from '@/app/plans/plans.shared';
import { nameSchema } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  productCode: z.string({ error: 'validators.form.invalid' }),
  name: nameSchema,
  tier: nameSchema,
  maxUsers: maxUsersSchema,
  amount: amountSchema,
  currency: currencySchema,
  interval: intervalSchema,
});

/** Un nivel de un producto en un plazo, por ejemplo "Pro · Trimestral". */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { productCode, ...data } = validateRequest({ schema, req });

  const product = await prisma.product.findUnique({ where: { code: productCode } });
  if (!product) throw new ErrorNotFound({ code: 'product.notFound' });

  const dup = await prisma.plan.findUnique({
    where: {
      productId_tier_interval: { productId: product.id, tier: data.tier, interval: data.interval },
    },
  });
  if (dup) throw new ErrorConflict({ code: 'plan.exists' });

  const plan = await prisma.plan.create({
    data: { ...data, productId: product.id },
    include: { product: true },
  });
  return response(res, req, next)(toPlan(plan));
}
