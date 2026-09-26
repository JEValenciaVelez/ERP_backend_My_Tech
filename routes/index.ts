import { Router } from 'express';

import { create } from '@/helpers/intersect-controller';
import { requireAdmin, requireAdminOrAdvisor, requireStaff } from '@/middleware/_auth';

/**
 * Todas las rutas del ERP y quién puede llamarlas. El alcance fino (qué
 * clientes ve un asesor, qué tickets ve sistemas) lo decide cada endpoint.
 */
const r = Router();

// Sesión
create(r, '/auth/login', import('@/app/auth/login/route'));
create(r, '/auth/me', import('@/app/auth/me/route'), requireStaff);

// Staff: el admin da de alta asesores, sistemas y otros admins.
// El listado lo usan todos (asesores: para elegir a quién escalar).
create(r, '/staff/list', import('@/app/staff/list/route'), requireStaff);
create(r, '/staff/create', import('@/app/staff/create/route'), requireAdmin);
create(r, '/staff/update', import('@/app/staff/update/route'), requireAdmin);

// Catálogo comercial
create(r, '/products/list', import('@/app/products/list/route'), requireStaff);
create(r, '/plans/list', import('@/app/plans/list/route'), requireStaff);
create(r, '/plans/create', import('@/app/plans/create/route'), requireAdmin);
create(r, '/plans/update', import('@/app/plans/update/route'), requireAdmin);

// Clientes: el asesor afilia y mantiene los suyos; el admin asigna y vincula.
create(r, '/clients/list', import('@/app/clients/list/route'), requireAdminOrAdvisor);
create(r, '/clients/get', import('@/app/clients/get/route'), requireAdminOrAdvisor);
create(r, '/clients/create', import('@/app/clients/create/route'), requireAdminOrAdvisor);
create(r, '/clients/update', import('@/app/clients/update/route'), requireAdminOrAdvisor);
create(r, '/clients/assign', import('@/app/clients/assign/route'), requireAdmin);
create(r, '/clients/link-product', import('@/app/clients/link-product/route'), requireAdmin);

// Suscripciones y pagos: solo admin registra dinero.
create(r, '/subscriptions/create', import('@/app/subscriptions/create/route'), requireAdmin);
create(
  r,
  '/subscriptions/change-plan',
  import('@/app/subscriptions/change-plan/route'),
  requireAdmin
);
create(r, '/subscriptions/cancel', import('@/app/subscriptions/cancel/route'), requireAdmin);
create(r, '/payments/list', import('@/app/payments/list/route'), requireAdminOrAdvisor);
create(r, '/payments/register', import('@/app/payments/register/route'), requireAdmin);
create(r, '/payments/refund', import('@/app/payments/refund/route'), requireAdmin);

// Comisiones y liquidaciones: el asesor ve las suyas; el admin liquida.
create(r, '/commissions/list', import('@/app/commissions/list/route'), requireAdminOrAdvisor);
create(r, '/settlements/list', import('@/app/settlements/list/route'), requireAdminOrAdvisor);
create(r, '/settlements/close', import('@/app/settlements/close/route'), requireAdmin);
create(r, '/settlements/mark-paid', import('@/app/settlements/mark-paid/route'), requireAdmin);

// Envío de acceso a los productos
create(r, '/access/retry-pending', import('@/app/access/retry-pending/route'), requireAdmin);

// Panel
create(r, '/dashboard/summary', import('@/app/dashboard/summary/route'), requireAdminOrAdvisor);

// Soporte: asesor de primera línea, sistemas cuando se escala.
create(r, '/tickets/list', import('@/app/tickets/list/route'), requireStaff);
create(r, '/tickets/get', import('@/app/tickets/get/route'), requireStaff);
create(r, '/tickets/create', import('@/app/tickets/create/route'), requireAdminOrAdvisor);
create(r, '/tickets/comment', import('@/app/tickets/comment/route'), requireStaff);
create(r, '/tickets/escalate', import('@/app/tickets/escalate/route'), requireAdminOrAdvisor);
create(r, '/tickets/resolve', import('@/app/tickets/resolve/route'), requireStaff);
create(r, '/tickets/close', import('@/app/tickets/close/route'), requireAdminOrAdvisor);
create(r, '/tickets/reopen', import('@/app/tickets/reopen/route'), requireAdminOrAdvisor);

export default r;
