# ERP interno

Gestión de la empresa: clientes, suscripciones, pagos, comisiones de asesores
y soporte. Es transversal a los productos: hoy **kompra** (fidelización) y
**fío** (cobranza en campo), y los que sigan.

Por ahora es solo el modelo de datos. No hay API todavía, así que la
integración con los productos está descrita pero no construida.

## La frontera con los productos

| Aquí (ERP)                                  | En el backend de cada producto        |
| ------------------------------------------- | ------------------------------------- |
| Cliente, contacto, NIT                      | El tenant y sus usuarios              |
| Suscripción, plan, pagos                    | Un `accessUntil`: hasta cuándo entra  |
| Asesor asignado y su comisión               | —                                     |
| Tickets de soporte                          | —                                     |
| Datos operativos de un producto             | Puntos, ventas, premios, campañas     |

El puente es `ProductAccount.externalId`: guarda el id del tenant en el
producto (el `Business.id` de kompra, el `empresa.id` de fío). El ERP nunca
copia datos operativos; los consulta por API cuando los necesite para un KPI.

Cuando entra un pago, el ERP le actualiza al producto su fecha de acceso. Es lo
único que el producto necesita saber de la relación comercial.

### Quién responde por qué

| El ERP                                        | Cada producto                              |
| --------------------------------------------- | ------------------------------------------ |
| Sabe a qué cliente pertenece cada tenant       | No sabe que existe un cliente ni un asesor |
| Cobra, registra pagos y calcula comisiones     | Nunca calcula comisiones ni conoce precios |
| Empuja la fecha de acceso cuando entra un pago | Lee su fecha y decide si deja entrar       |
| Guarda los tickets y mide el soporte           | Opera su dominio y nada más                |

La regla que resume todo: **el ERP escribe la fecha, el producto la obedece**.
Ningún producto pregunta por el estado de una suscripción, ni consulta la base
del ERP, ni replica el plan contratado. Recibe una fecha y la respeta.

Ojo con un homónimo que ya causó confusión: en fío, las tablas `pago`, `cobro`
y `movimiento_cartera` son plata que el DEUDOR le paga al tenant — el negocio
del cliente. **No son ingresos nuestros.** Lo que el cliente nos paga a nosotros
es su suscripción, y solo vive aquí. Una comisión calculada sobre el recaudo de
fío daría una cifra sin ninguna relación con lo facturado.

### El contrato de acceso

| Producto | Campo                    | Tipo          | Estado                    |
| -------- | ------------------------ | ------------- | ------------------------- |
| kompra   | `Business.accessUntil`   | `timestamp`   | columna creada, sin uso   |
| fío      | `empresa.acceso_hasta`   | `TIMESTAMPTZ` | columna creada, sin uso   |

`NULL` significa que todavía no hay suscripción vigente (registro nuevo o
prueba), no que el acceso sea libre.

Hoy **nadie escribe ni lee esas columnas**: están puestas para que el dato tenga
dónde vivir el día que se conecten. Faltan tres piezas, y ninguna existe:

1. **Quién escribe** — el ERP, al confirmar un pago. Pide una API aquí y un
   endpoint en cada producto que reciba la fecha. Se autentica con una
   credencial de servicio de solo escritura sobre ese campo, distinta por
   producto para poder revocar una sin tumbar la otra: **nunca con un usuario
   admin**, que tendría permiso sobre todo el tenant y ensuciaría la auditoría.
   La escritura debe ser idempotente: reenviar el mismo pago no puede correr la
   fecha dos veces.
2. **Quién lee** — un middleware en cada producto que corte cuando la fecha
   venza.
3. **Qué ve el usuario** — recién ahí los frontends necesitan manejar esa
   respuesta y mostrar el aviso.

### Decisiones abiertas

Ninguna urge, pero conviene no improvisarlas el día del primer corte:

- **Qué pasa exactamente al vencer.** Qué código HTTP, si el dueño conserva
  acceso de solo lectura para poder pagar, y qué ocurre con un cobrador de fío
  que está a mitad de ruta: cortarle la app en la calle no es lo mismo que
  cerrarle el panel al jefe.
- **Periodo de gracia.** Cuántos días después del vencimiento se sigue
  entrando, y si lo define el plan o es igual para todos.
- **Quién da de alta al cliente.** Lo natural con el tiempo es que nazca aquí y
  el ERP provisione el tenant en el producto. Mientras no haya API, se crea en
  el producto y aquí se referencia por `externalId`.
- **Base de la comisión.** Hoy el modelo asume la suscripción. Comisionar sobre
  volumen recaudado exigiría leer métricas del producto y cambiaría el cálculo.

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
