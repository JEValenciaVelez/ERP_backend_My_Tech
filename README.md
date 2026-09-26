# ERP interno

Gestión de la empresa: clientes, suscripciones, pagos, comisiones de asesores
y soporte. Es transversal a los productos: hoy **kompra** (fidelización) y
**fío** (cobranza en campo), y los que sigan.

Tiene API (este repo) y panel ([frontend-erp](../frontend-erp)). El envío de
la fecha de acceso ya está construido del lado del ERP; falta el endpoint que la
reciba en cada producto (ver «El contrato de acceso»).

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

## Quién hace qué en el panel

| Rol | Puede |
| --- | --- |
| **ADMIN** | Todo: staff y % de cada asesor, planes, clientes, asignaciones, suscripciones, registrar y reembolsar pagos, liquidar comisiones, reintentar envíos de acceso |
| **ADVISOR** (asesor comercial) | Afiliar empresas (queda como titular), ver y editar SUS empresas, ver sus pagos y SU comisión, sus liquidaciones, abrir tickets y escalarlos a sistemas |
| **SYSTEMS** (TI) | Ver los tickets que le escalaron, comentar y marcarlos resueltos |

El alcance lo impone el servidor: un asesor que pide un cliente ajeno recibe 404.

## Reglas del dinero

- **Pago manual** (`payments/register`, sin pasarela). En una transacción: el pago
  cubre el siguiente período según el plazo del plan (mensual, trimestral,
  semestral o anual), la suscripción queda `ACTIVE`, se devenga la comisión y
  queda pendiente enviar `accessUntil` y `maxUsers` al producto.
- **Período:** si la suscripción sigue vigente, el nuevo arranca donde termina
  el actual (pagar antes no hace perder días); si ya venció, arranca el día del
  pago.
- **Idempotencia:** la misma referencia (`externalRef`) devuelve el pago
  existente en vez de duplicarlo.
- **Comisión:** para el asesor titular vigente, con su `commissionRate` de ese
  momento (se copia a la comisión). Recurrente: cada pago de sus empresas.
- **Liquidación:** cada asesor tiene una abierta que acumula sus comisiones. Al
  cerrarla el total se congela; la siguiente empieza en ese momento. Luego se
  marca pagada (transferencia manual).
- **Reembolso:** reversa la comisión. Si ya estaba liquidada, se descuenta
  (`deductions`) de la próxima liquidación del asesor. No mueve la fecha de
  acceso: para cortar el servicio se cancela la suscripción.
- **Cancelación:** el cliente conserva el acceso hasta el final de lo que pagó.

## Puesta en marcha (local)

```bash
pnpm install
cp .env.example .env          # y apuntar DATABASE_URL a la base del ERP
createdb erp_db
pnpm db:migrate               # aplica las migraciones (incluye el índice parcial de titular único)
pnpm db:seed                  # productos, admin (admin@erp.dev / admin12345) y planes de ejemplo
pnpm dev                      # API en http://localhost:8300
```

Tests (`pnpm test`): corren contra `erp_db_test` (se crea con `createdb erp_db_test`),
nunca contra la base de desarrollo; el setup la migra y la vacía.

## Despliegue

Mismo patrón que Mérito: **Render** para base, Key Value y API; **Vercel** para el panel.

- `render.yaml`: producción (rama `main`). `render.sandbox.yaml`: sandbox (rama
  `sandbox`), como Blueprint aparte.
- Las migraciones corren en `preDeployCommand` en cada deploy.
- Después del primer deploy:
  1. En el servicio: `CORS_ORIGINS` con la URL exacta del panel en Vercel, y
     `ADMIN_NOMBRE`, `ADMIN_CORREO`, `ADMIN_CLAVE` (mínimo 12 caracteres).
  2. En el Shell del servicio: `node dist/seed.js` crea los productos y el
     administrador. En producción no crea planes: se crean desde el panel.
  3. Borra `ADMIN_CLAVE` del servicio.
  4. En Vercel (proyecto `frontend-erp`): `VITE_API_URL=https://erp-api.onrender.com/api/v1`.
- `ANT_API_URL` y `ANT_SERVICE_TOKEN` quedan vacíos hasta que exista
  `backend-ant`; mientras tanto los envíos de acceso quedan pendientes y se
  reintentan desde el panel (Resumen → «Reintentar envío»).
