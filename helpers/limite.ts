import crypto from 'crypto';

import { ErrorTooManyRequests } from '@/config/errors';
import { borrarVentana, incrementarVentana, leerVentana } from '@/helpers/redis';

/**
 * Límite de ritmo de intentos fallidos (F2, sección 5).
 *
 * Cuenta FALLOS, no peticiones, y es un freno de ritmo, no un bloqueo de cuenta:
 * al vencer la ventana se vuelve a poder intentar. Un bloqueo por correo dejaría
 * a cualquiera cerrarle la cuenta a un aspirante escribiendo su correo mal diez
 * veces.
 *
 * Las claves van con sha256: en Redis no queda ni un correo ni una IP en claro.
 */

export interface ILimite {
  /** Espacio de nombres: `login:correo`, `login:ip`, `mi-clave`… */
  ambito: string;
  /** Lo que se limita: el correo normalizado, la IP, el id del usuario. */
  sujeto: string;
  max: number;
  ventanaSegundos: number;
}

const clave = ({ ambito, sujeto }: ILimite) =>
  `limite:${ambito}:${crypto.createHash('sha256').update(sujeto).digest('hex')}`;

/** Lanza 429 con `retryAfter` si alguno de los límites ya se agotó. */
export async function exigirMargen(...limites: ILimite[]): Promise<void> {
  for (const limite of limites) {
    const { cuenta, restante } = await leerVentana(clave(limite));
    if (cuenta >= limite.max) {
      throw new ErrorTooManyRequests({
        code: 'auth.demasiadosIntentos',
        retryAfter: Math.max(restante, 1),
      });
    }
  }
}

export async function registrarFallo(...limites: ILimite[]): Promise<void> {
  await Promise.all(limites.map((l) => incrementarVentana(clave(l), l.ventanaSegundos)));
}

/** Tras un acierto: el ritmo es de fallos, quien entra bien no arrastra los anteriores. */
export async function olvidarFallos(...limites: ILimite[]): Promise<void> {
  await Promise.all(limites.map((l) => borrarVentana(clave(l))));
}

/**
 * Límite de ritmo de una acción: cuenta TODAS las peticiones, no solo los fallos
 * (F7, crear resaltados). Suma y, si pasa del máximo, 429 `limite.ritmo`.
 */
export async function consumirRitmo(limite: ILimite): Promise<void> {
  const { cuenta, restante } = await incrementarVentana(clave(limite), limite.ventanaSegundos);
  if (cuenta > limite.max) {
    throw new ErrorTooManyRequests({ code: 'limite.ritmo', retryAfter: Math.max(restante, 1) });
  }
}
