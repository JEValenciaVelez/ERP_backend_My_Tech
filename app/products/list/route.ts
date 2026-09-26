import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

export default async function (req: Request, res: Response, next: Next) {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
  return response(res, req, next)(products);
}
