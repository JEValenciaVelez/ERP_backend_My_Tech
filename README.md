# ERP interno

Gestión de la empresa: clientes, suscripciones, pagos, comisiones de asesores
y soporte. Es transversal a los productos (kompra y los que sigan).

Por ahora es solo el modelo de datos. No hay API todavía.

## La frontera con los productos

| Aquí (ERP)                                  | En el backend de cada producto        |
| ------------------------------------------- | ------------------------------------- |
| Cliente, contacto, NIT                      | El tenant y sus usuarios              |
| Suscripción, plan, pagos                    | Un `accessUntil`: hasta cuándo entra  |
| Asesor asignado y su comisión               | —                                     |
| Tickets de soporte                          | —                                     |
| Datos operativos de un producto             | Puntos, ventas, premios, campañas     |

El puente es `ProductAccount.externalId`: guarda el id del tenant en el
producto (el `Business.id` de kompra). El ERP nunca copia datos operativos;
los consulta por API cuando los necesite para un KPI.

Cuando entra un pago, el ERP le actualiza al producto su `accessUntil`. Es lo
único que el producto necesita saber de la relación comercial.

## Decisiones que ya están tomadas en el schema

Están comentadas en `prisma/schema.prisma`, pero las que más importan:

- **La asignación asesor↔cliente es histórica** (`startedAt` / `endedAt`). La
  comisión se atribuye al asesor vigente en la fecha del pago, así reasignar
  una cuenta no reescribe el pasado. Un índice parcial impide dos titulares
  vigentes a la vez.
- **La comisión se devenga contra un pago en `PAID`**, nunca contra la
  factura: si la plata no entró, no hay comisión que reversar después.
- **Las tasas y los precios se congelan** en cada registro. Subir tarifas
  mañana no mueve un peso del pasado.
- **El ticket tiene dos relojes** (primera respuesta y resolución) y el asesor
  no lo suelta al escalar: `ownerId` va aparte de `escalatedToId`.
- **`reopenCount` es diagnóstico, no indicador de desempeño.** El día que
  reportar problemas perjudique al asesor, los tickets dejan de reflejar la
  realidad.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # y apuntar DATABASE_URL a la base del ERP
createdb erp_db               # o crearla desde psql
pnpm db:migrate --name init
pnpm db:generate
```

Falta agregar el índice parcial que garantiza un solo asesor titular vigente
por cliente. Prisma no expresa índices con `WHERE`, así que va en una
migración escrita a mano:

```sql
CREATE UNIQUE INDEX "client_assignments_titular_vigente_key"
  ON "client_assignments" ("clientId")
  WHERE "endedAt" IS NULL AND "isBackup" = false;
```

Se crea con `npx prisma migrate dev --create-only --name unico_titular_vigente`
y se pega ese SQL en el `migration.sql` generado.
