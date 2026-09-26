import { createClient } from 'redis';

import { NODE_ENV, REDIS_URL } from '@/config/env.config';

import Logger from './logger-pino';

const cache: any = {};
const client = createClient({ url: REDIS_URL });
let redisIsUp = false;

/** Entornos desplegados: ahí un fallo de Redis va al logger, no a la consola. */
const DESPLEGADO = ['production', 'sandbox'].includes(NODE_ENV);

// Sin catch, un Redis caído deja una promesa rechazada sin manejar y tumba el
// proceso en Node 20+. El cache en memoria cubre la caída.
client
  .connect()
  .then(() => {
    redisIsUp = true;
  })
  .catch((error) => {
    redisIsUp = false;
    if (DESPLEGADO) {
      Logger.logError({ error, method: 'redis-connect' });
    } else {
      console.warn('[Redis] no disponible — usando cache en memoria');
    }
  });

client.on('error', (err) => {
  redisIsUp = false;
  if (DESPLEGADO) {
    Logger.logError({
      error: err,
      method: 'redis',
    });
  }
});

client.on('ready', () => {
  redisIsUp = true;
});

/** Health check para la probe de readiness y para clearCacheRedis. */
export async function isRedisAlive() {
  try {
    if (!client.isOpen) return false;
    await client.ping();
    return true;
  } catch (e) {
    Logger.logError({
      error: e,
      method: 'redis-ping',
    });
    return false;
  }
}

export async function clearCacheRedis() {
  try {
    if (!(await isRedisAlive())) return false;
    await client.flushAll();
    return true;
  } catch (e) {
    Logger.logError({
      error: e,
      method: 'redis-flushall',
    });
    return false;
  }
}

export async function setCacheRedis(key: string, value: string, ttlSeconds = 0) {
  try {
    if (!redisIsUp) {
      throw new Error('Redis is not up');
    }

    if (ttlSeconds > 0) {
      await client.set(key, value, { EX: ttlSeconds });
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (e) {
    if (DESPLEGADO) {
      Logger.logError({
        error: e,
        method: 'redis-set',
      });
    }
    cache[key] = {
      value,
      timeExpire: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Date.now() + 10000,
    };
    return false;
  }
}

export async function getCacheRedis(key: string) {
  try {
    if (!redisIsUp) {
      throw new Error('Redis is not up');
    }
    const raw = await client.get(key);
    return raw || null;
  } catch (e) {
    if (DESPLEGADO) {
      Logger.logError({
        error: e,
        method: 'redis-get',
      });
    }

    if (!cache?.[key]) {
      return null;
    }
    if (cache?.[key].timeExpire < Date.now()) {
      return null;
    }
    return cache?.[key].value;
  }
}

// ─── Ventanas de conteo (límite de intentos) ─────────────────────────────────

/** Contadores con caducidad en memoria, para cuando Redis no está. */
const ventanas = new Map<string, { cuenta: number; vence: number }>();

export interface IVentana {
  cuenta: number;
  /** Segundos que faltan para que la ventana se reinicie. */
  restante: number;
}

function ventanaEnMemoria(key: string): { cuenta: number; vence: number } | null {
  const v = ventanas.get(key);
  if (!v) return null;
  if (v.vence <= Date.now()) {
    ventanas.delete(key);
    return null;
  }
  return v;
}

/**
 * Suma uno al contador de `key`. La ventana empieza con el primer golpe y dura
 * `ttlSeconds`: es fija, no deslizante, que basta para frenar el ritmo.
 */
export async function incrementarVentana(key: string, ttlSeconds: number): Promise<IVentana> {
  if (redisIsUp) {
    try {
      const cuenta = await client.incr(key);
      // Solo el primer golpe fija la caducidad. Sin `EXPIRE … NX`, que exige
      // Redis 7. Si el proceso muere entre las dos llamadas, el `ttl < 0` de
      // abajo lo repara en el siguiente intento.
      if (cuenta === 1) await client.expire(key, ttlSeconds);
      let ttl = await client.ttl(key);
      if (ttl < 0) {
        await client.expire(key, ttlSeconds);
        ttl = ttlSeconds;
      }
      return { cuenta, restante: ttl };
    } catch (e) {
      if (DESPLEGADO) Logger.logError({ error: e, method: 'redis-incr' });
    }
  }
  const actual = ventanaEnMemoria(key) ?? { cuenta: 0, vence: Date.now() + ttlSeconds * 1000 };
  actual.cuenta += 1;
  ventanas.set(key, actual);
  return { cuenta: actual.cuenta, restante: Math.ceil((actual.vence - Date.now()) / 1000) };
}

/** Lee el contador sin tocarlo. */
export async function leerVentana(key: string): Promise<IVentana> {
  if (redisIsUp) {
    try {
      const [valor, ttl] = (await client.multi().get(key).ttl(key).exec()) as unknown as [
        string | null,
        number,
      ];
      return { cuenta: valor ? Number(valor) : 0, restante: ttl > 0 ? ttl : 0 };
    } catch (e) {
      if (DESPLEGADO) Logger.logError({ error: e, method: 'redis-get' });
    }
  }
  const v = ventanaEnMemoria(key);
  return v
    ? { cuenta: v.cuenta, restante: Math.ceil((v.vence - Date.now()) / 1000) }
    : { cuenta: 0, restante: 0 };
}

export async function borrarVentana(key: string): Promise<void> {
  ventanas.delete(key);
  if (!redisIsUp) return;
  try {
    await client.del(key);
  } catch (e) {
    if (DESPLEGADO) Logger.logError({ error: e, method: 'redis-del' });
  }
}
