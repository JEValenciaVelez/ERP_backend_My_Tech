import { ADMIN_CLAVE, ADMIN_CORREO, ADMIN_NOMBRE, NODE_ENV } from '@/config/env.config';
import { hashSecret } from '@/helpers/auth';
import prisma from '@/models';

/**
 * `pnpm db:seed` en local, o `node dist/seed.js` desde el Shell de Render.
 * Idempotente: se puede correr las veces que haga falta sin duplicar nada.
 *
 * - Siempre: los productos y el administrador inicial (ADMIN_*). En producción
 *   ADMIN_* es obligatorio: allí no hay credenciales por defecto.
 * - Fuera de producción: los planes de EJEMPLO de ANT. En producción los planes
 *   se crean desde el panel con los precios reales.
 */

const PRODUCTS = [
  { code: 'ant', name: 'ANT — Materiales eléctricos' },
  { code: 'kompra', name: 'Kompra — Fidelización' },
  { code: 'fio', name: 'Fío — Cobranza en campo' },
];

// Niveles de ANT por tamaño del equipo, con descuento por plazo largo.
const ANT_TIERS = [
  { tier: 'Básico', maxUsers: 10, monthly: 49 },
  { tier: 'Pro', maxUsers: 50, monthly: 149 },
  { tier: 'Empresa', maxUsers: null, monthly: 399 },
];
const ANT_TERMS = [
  { interval: 'QUARTERLY', label: 'Trimestral', months: 3, discount: 0.05 },
  { interval: 'SEMIANNUAL', label: 'Semestral', months: 6, discount: 0.1 },
  { interval: 'YEARLY', label: 'Anual', months: 12, discount: 0.2 },
] as const;

async function seedAdmin() {
  const isProd = NODE_ENV === 'production';
  const nombre = ADMIN_NOMBRE ?? (isProd ? undefined : 'Administrador');
  const correo = (ADMIN_CORREO ?? (isProd ? undefined : 'admin@erp.dev'))?.trim().toLowerCase();
  const clave = ADMIN_CLAVE ?? (isProd ? undefined : 'admin12345');
  if (!nombre || !correo || !clave) {
    throw new Error(
      'Faltan ADMIN_NOMBRE, ADMIN_CORREO o ADMIN_CLAVE para crear el administrador inicial.'
    );
  }
  if (isProd && clave.length < 12) {
    throw new Error('ADMIN_CLAVE debe tener al menos 12 caracteres en producción.');
  }

  const existing = await prisma.staff.findUnique({ where: { email: correo } });
  if (existing) return `ℹ️  El administrador ${correo} ya existía: no se tocó.`;
  await prisma.staff.create({
    data: { role: 'ADMIN', name: nombre, email: correo, passwordHash: await hashSecret(clave) },
  });
  return `✅ Administrador inicial creado: ${correo}`;
}

async function seedExamplePlans() {
  const ant = await prisma.product.findUniqueOrThrow({ where: { code: 'ant' } });
  for (const t of ANT_TIERS) {
    for (const term of ANT_TERMS) {
      const amount = Math.round(t.monthly * term.months * (1 - term.discount));
      await prisma.plan.upsert({
        where: {
          productId_tier_interval: { productId: ant.id, tier: t.tier, interval: term.interval },
        },
        update: {},
        create: {
          productId: ant.id,
          name: `${t.tier} · ${term.label}`,
          tier: t.tier,
          maxUsers: t.maxUsers,
          amount,
          currency: 'USD',
          interval: term.interval,
        },
      });
    }
  }
}

async function main() {
  for (const p of PRODUCTS) {
    await prisma.product.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  console.warn(await seedAdmin());
  if (NODE_ENV !== 'production') {
    await seedExamplePlans();
    console.warn('✅ Planes de ejemplo de ANT listos (precios provisionales).');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
