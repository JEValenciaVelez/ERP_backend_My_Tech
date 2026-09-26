import 'dotenv/config';

import { z } from 'zod';

const envVar = z.string().min(1);
const numberVar = z.coerce.number();

/**
 * Opcional de verdad: dotenv entrega "" cuando la línea existe vacía, y "" no
 * pasa `.min(1)`. Sin este preprocess, dejar un placeholder en blanco en el
 * .env tumba el arranque.
 */
const optionalVar = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'sandbox', 'production', 'test']).default('development'),
  DEFAULT_LANG: envVar.default('es'),
  PORT: numberVar.default(8300),
  MULTI_CORE: numberVar.min(0).max(1).default(0),

  // Orígenes permitidos para CORS, separados por coma. '*' solo en desarrollo.
  CORS_ORIGINS: envVar.default('*'),

  /**
   * Saltos de proxy de confianza (`app.set('trust proxy', …)`). En Render hay
   * uno delante: con 1, req.ip sale de x-forwarded-for. De eso depende el
   * límite de intentos del login por IP.
   */
  TRUST_PROXY: numberVar.int().min(0).default(0),

  // Ventanas del límite de intentos. Sin Redis se usa memoria, pero cada
  // deploy o reinicio olvidaría los fallos.
  REDIS_URL: envVar.default('redis://127.0.0.1:6379'),

  // Límite de ritmo del login: intentos FALLIDOS por ventana (helpers/limite.ts).
  LOGIN_VENTANA_SEGUNDOS: numberVar
    .int()
    .min(1)
    .default(15 * 60),
  LOGIN_MAX_POR_CORREO: numberVar.int().min(1).default(10),
  LOGIN_MAX_POR_IP: numberVar.int().min(1).default(50),

  JWT_SECRET: envVar.min(24, 'JWT_SECRET debe tener al menos 24 caracteres'),
  JWT_ACCESS_TTL: envVar.default('12h'),

  DATABASE_URL: envVar,

  // Envío de accessUntil/maxUsers al backend de ANT. Sin URL, el envío queda
  // pendiente en ProductAccount y se reintenta cuando exista la conexión.
  ANT_API_URL: optionalVar,
  // Credencial de servicio propia de ANT: solo sirve para escribir el acceso.
  ANT_SERVICE_TOKEN: optionalVar,

  // Administrador inicial para `node dist/seed.js`. Obligatorio en producción:
  // allí no hay credenciales por defecto.
  ADMIN_NOMBRE: optionalVar,
  ADMIN_CORREO: optionalVar,
  ADMIN_CLAVE: optionalVar,

  API_TOKEN_PINO: optionalVar,
});

const { success, error, data } = envSchema.safeParse(process.env);

if (!success) {
  console.error('❌ Error al validar las variables de entorno:', error.format());
  process.exit(1);
}

export const {
  NODE_ENV,
  DEFAULT_LANG,
  PORT,
  MULTI_CORE,
  CORS_ORIGINS,
  TRUST_PROXY,
  REDIS_URL,
  LOGIN_VENTANA_SEGUNDOS,
  LOGIN_MAX_POR_CORREO,
  LOGIN_MAX_POR_IP,
  JWT_SECRET,
  JWT_ACCESS_TTL,
  DATABASE_URL,
  ANT_API_URL,
  ANT_SERVICE_TOKEN,
  ADMIN_NOMBRE,
  ADMIN_CORREO,
  ADMIN_CLAVE,
  API_TOKEN_PINO,
} = data;
