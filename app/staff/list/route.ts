import { validateRequest } from 'config/validation/validators';
import { z } from 'zod';

import { roleSchema, toStaff } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';
import prisma from '@/models';

const schema = z.object({
  role: roleSchema.optional(),
  activeOnly: z.boolean().optional(),
});

/**
 * Listado del staff. El admin lo ve completo; asesores y sistemas solo reciben
 * los activos de sistemas, que es lo que necesitan para escalar un ticket.
 */
export default async function (req: Request<typeof schema>, res: Response, next: Next) {
  const { role, activeOnly } = validateRequest({ schema, req });
  const me = req.staff!;

  const where =
    me.role === 'ADMIN'
      ? { ...(role ? { role } : {}), ...(activeOnly ? { active: true } : {}) }
      : { role: 'SYSTEMS' as const, active: true };

  const staff = await prisma.staff.findMany({ where, orderBy: [{ role: 'asc' }, { name: 'asc' }] });

  if (me.role !== 'ADMIN') {
    return response(res, req, next)(staff.map((s) => ({ id: s.id, name: s.name, role: s.role })));
  }

  // Cartera vigente y comisión pendiente por asesor, para la tabla del admin.
  const [owned, pending] = await Promise.all([
    prisma.clientAssignment.groupBy({
      by: ['staffId'],
      where: { endedAt: null, isBackup: false },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({
      by: ['staffId'],
      where: { status: 'PENDING' },
      _sum: { amount: true },
    }),
  ]);
  const ownedBy = new Map(owned.map((o) => [o.staffId, o._count._all]));
  const pendingBy = new Map(pending.map((p) => [p.staffId, p._sum.amount]));

  return response(
    res,
    req,
    next
  )(
    staff.map((s) => ({
      ...toStaff(s),
      clientCount: ownedBy.get(s.id) ?? 0,
      pendingCommission: pendingBy.get(s.id) ?? '0',
    }))
  );
}
