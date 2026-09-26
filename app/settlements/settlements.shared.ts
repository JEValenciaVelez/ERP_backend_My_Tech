import type { Settlement, Staff } from '@prisma/client';

export const toSettlement = (s: Settlement & { staff?: Pick<Staff, 'id' | 'name'> }) => ({
  id: s.id,
  staff: s.staff ? { id: s.staff.id, name: s.staff.name } : undefined,
  periodStart: s.periodStart,
  periodEnd: s.periodEnd,
  status: s.status,
  total: s.total,
  deductions: s.deductions,
  currency: s.currency,
  closedAt: s.closedAt,
  paidAt: s.paidAt,
  notes: s.notes,
});
