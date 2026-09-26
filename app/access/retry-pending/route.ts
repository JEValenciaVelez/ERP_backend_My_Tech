import { pushAccess } from '@/app/access/access.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

/** Reintenta los envíos de acceso que el producto no confirmó. */
export default async function (req: Request, res: Response, next: Next) {
  const pending = await prisma.productAccount.findMany({
    where: { accessUntil: { not: null }, accessPushedAt: null },
    select: { id: true },
  });
  const results = [];
  for (const a of pending) results.push({ id: a.id, ...(await pushAccess(a.id)) });
  return response(
    res,
    req,
    next
  )({
    attempted: results.length,
    pushed: results.filter((r) => r.pushed).length,
    results,
  });
}
