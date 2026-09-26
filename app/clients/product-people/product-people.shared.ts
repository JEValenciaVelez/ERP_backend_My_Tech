import { z } from 'zod';

/**
 * Gente de la empresa dentro del producto. La gestión es mixta: el
 * administrador de la empresa la lleva en el producto y el asesor del cliente
 * la ve y actúa desde el ERP. El ERP no guarda copia: todo se lee y escribe en
 * el producto, que aplica el tope de usuarios del plan.
 */
export type ProductUser = {
  id: string;
  name: string;
  role: string | null;
  isCompanyAdmin: boolean;
  email: string | null;
  phone: string | null;
  active: boolean;
  hasPin: boolean;
  mustChangePin: boolean;
  lastLoginAt: string | null;
};

/** Solo lo que el panel muestra, aunque el producto mande más. */
export const toProductUser = (u: ProductUser): ProductUser => ({
  id: u.id,
  name: u.name,
  role: u.role,
  isCompanyAdmin: u.isCompanyAdmin,
  email: u.email,
  phone: u.phone,
  active: u.active,
  hasPin: u.hasPin,
  mustChangePin: !!u.mustChangePin,
  lastLoginAt: u.lastLoginAt,
});

// Roles operativos de ANT. Los administradores de la empresa se crean en el
// producto (o con reset-product-admin), no desde aquí.
export const productRoleSchema = z.enum(
  ['FOREMAN', 'JOURNEYMAN', 'APPRENTICE', 'WAREHOUSE_MANAGER', 'WAREHOUSE_WORKER'],
  { error: 'validators.form.invalid' }
);

// El PIN lo fija el asesor; el producto obliga a la persona a cambiarlo al
// entrar.
export const productPinSchema = z
  .string({ error: 'productUser.pinRequired' })
  .regex(/^[0-9]{4}$/, { error: 'productUser.pinRequired' });

export const productUserErrors = {
  'company.userLimit': { status: 409, code: 'productUser.limit' },
  'user.email.exists': { status: 409, code: 'productUser.emailExists' },
  'user.phone.exists': { status: 409, code: 'productUser.phoneExists' },
  'user.pinRequired': { status: 400, code: 'productUser.pinRequired' },
  'user.lastAdmin': { status: 400, code: 'productUser.lastAdmin' },
} as const;
