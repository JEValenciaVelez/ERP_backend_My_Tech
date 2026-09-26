import type { Prisma, Staff } from '@prisma/client';
import { ErrorNotFound } from 'config/errors';

import prisma from '@/models';

/**
 * Quién ve qué ticket. El asesor: los que abrió y los de sus clientes actuales
 * (si hereda una cuenta, hereda su historial). Sistemas: los que le escalaron.
 */
export function ticketScopeWhere(staff: Staff): Prisma.TicketWhereInput {
  if (staff.role === 'ADMIN') return {};
  if (staff.role === 'SYSTEMS') return { escalatedToId: staff.id };
  return {
    OR: [
      { ownerId: staff.id },
      { client: { assignments: { some: { staffId: staff.id, endedAt: null } } } },
    ],
  };
}

export async function findVisibleTicket(staff: Staff, id: string) {
  const t = await prisma.ticket.findFirst({ where: { id, ...ticketScopeWhere(staff) } });
  if (!t) throw new ErrorNotFound({ code: 'ticket.notFound' });
  return t;
}
