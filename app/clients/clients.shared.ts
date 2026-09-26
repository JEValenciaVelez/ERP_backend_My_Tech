import type { Prisma, Staff } from '@prisma/client';
import { ErrorForbidden, ErrorNotFound } from 'config/errors';

import prisma from '@/models';

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Qué clientes ve cada rol. El asesor solo los que atiende HOY (titular o
 * suplente vigente); reasignar una cuenta le quita la vista al anterior. El
 * área de sistemas no navega clientes: los ve a través de sus tickets.
 */
export function clientScopeWhere(staff: Staff): Prisma.ClientWhereInput {
  if (staff.role === 'ADMIN') return {};
  if (staff.role === 'ADVISOR') {
    return { assignments: { some: { staffId: staff.id, endedAt: null } } };
  }
  throw new ErrorForbidden({ code: 'auth.permissions' });
}

/** 404 (no 403) cuando no es suyo: no se confirma que el cliente exista. */
export async function assertClientVisible(staff: Staff, clientId: string, tx: Tx = prisma) {
  const client = await tx.client.findFirst({
    where: { id: clientId, ...clientScopeWhere(staff) },
  });
  if (!client) throw new ErrorNotFound({ code: 'client.notFound' });
  return client;
}

/** Titular vigente: a quien se le atribuye la comisión de cada pago. */
export function currentOwner(clientId: string, tx: Tx = prisma) {
  return tx.clientAssignment.findFirst({
    where: { clientId, endedAt: null, isBackup: false },
    include: { staff: true },
  });
}

/** Deja a staffId como titular, cerrando la asignación anterior sin borrarla. */
export async function assignOwner(clientId: string, staffId: string, tx: Tx) {
  const now = new Date();
  const current = await currentOwner(clientId, tx);
  if (current?.staffId === staffId) return current;
  if (current) {
    await tx.clientAssignment.update({ where: { id: current.id }, data: { endedAt: now } });
  }
  return tx.clientAssignment.create({
    data: { clientId, staffId, startedAt: now },
    include: { staff: true },
  });
}

export const staffSummary = (s: { id: string; name: string; email: string } | null | undefined) =>
  s ? { id: s.id, name: s.name, email: s.email } : null;
