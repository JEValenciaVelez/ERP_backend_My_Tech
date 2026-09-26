import cluster from 'cluster';
import express from 'express';
import helmet from 'helmet';
import { isect } from 'helpers/intersect-controller';
import Logger from 'helpers/logger-pino';
import { createServer } from 'http';
import { cpus } from 'os';
import v8 from 'v8';

import { Next, Request, Response } from '@/app/types.d';
import { HTTP_STATUS } from '@/config/constants';
import { CORS_ORIGINS, MULTI_CORE, PORT, TRUST_PROXY } from '@/config/env.config';
import prisma from '@/models';

import LangHelper from './helpers/langs';
import response from './helpers/response';
import ValidateBodyMiddleware from './middleware/_validate-body';
import apiRouter from './routes/index';

export default class Server {
  private app = express();
  private server?: ReturnType<typeof createServer>;

  createApp() {
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', TRUST_PROXY);
    this.app.use(helmet());
    this.app.use(express.urlencoded({ limit: '1mb', extended: true }));
    this.app.use(express.json({ limit: '10mb' }));

    // CORS por allowlist (CORS_ORIGINS, separados por coma). '*' = abierto.
    const allowedOrigins = CORS_ORIGINS.split(',').map((o: string) => o.trim());
    const allowAll = allowedOrigins.includes('*');
    // Métodos y headers que aceptamos en peticiones cross-origin. Todos los
    // endpoints son POST; GET es para las probes. `Allow-Headers` debe incluir
    // CUALQUIER header que el front mande (i18n, auth, trazas): si falta uno, el
    // navegador bloquea la petición real tras el preflight.
    const ALLOWED_METHODS = 'GET, POST, OPTIONS';
    const ALLOWED_HEADERS =
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, content-language, x-device-id';
    this.app.use(((req: Request, res: Response, next: Next) => {
      const origin = req.headers?.origin;
      if (allowAll) {
        res.header('Access-Control-Allow-Origin', '*');
      } else if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        // La respuesta depende del Origin: evita que un caché/CDN la reutilice
        // para otro origen.
        res.header('Vary', 'Origin');
      }
      res.header('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.header('Access-Control-Max-Age', '600'); // cachea el preflight 10 min

      // Preflight: cortar acá con 204. No tiene body ni debe correr i18n,
      // validación de envelope ni el router.
      if (req.method === 'OPTIONS') {
        res.status(HTTP_STATUS.NO_CONTENT).end('');
        return;
      }
      next();
    }) as any);

    // Probes: liveness simple y readiness (DB). Antes de i18n/validación
    // y del router, para que no requieran envelope ni token.
    this.app.get('/health', ((_req: Request, res: Response) => {
      res.status(HTTP_STATUS.OK).json({ status: 'ok' });
    }) as any);

    this.app.get('/health/ready', (async (_req: Request, res: Response) => {
      const db = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
      res.status(db ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: db ? 'ready' : 'degraded',
        db,
      });
    }) as any);

    this.app.use(LangHelper() as any);
    this.app.use(isect(ValidateBodyMiddleware) as any);

    this.app.use('/api/v1', apiRouter);

    // Catch-all de 404 para CUALQUIER método: con `app.get` un POST a una ruta
    // inexistente caía en el 404 HTML de Express en vez del JSON estandarizado.
    // El guard de headersSent es necesario porque response() llama a next()
    // después de enviar (mismo idiom que usa isect).
    this.app.use(function (req: Request, res: Response) {
      if (res.headersSent) return;
      return response(res, req)(null, { status: HTTP_STATUS.NOT_FOUND, code: 'page.notFound' });
    } as any);

    this.app.use(((err: any, req: Request, res: Response, _: Next) => {
      Logger.logError({
        error: err,
        method: 'general',
        body: req.body,
        userId: req.staff?.id,
        path: req.url,
      });

      return response(res, req)(null, {
        err,
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: err.code || 'server.error',
      });
    }) as any);

    const heapMb = (v8.getHeapStatistics().total_available_size / 1024 / 1024).toFixed(0);
    console.warn(`[Server] Memory limit: ${heapMb} MB — Port: ${PORT}`);

    return this.app;
  }

  async listen() {
    if (cluster.isPrimary && MULTI_CORE === 1) {
      const numCpus = cpus().length;
      for (let i = 0; i < numCpus; ++i) {
        cluster.fork();
      }
      cluster.on('exit', (worker) => {
        console.warn(`[Cluster] Worker ${worker.id} died — restarting`);
        cluster.fork();
      });
    } else {
      this.createApp();
      this.server = createServer(this.app);
      this.server.listen(PORT);
      // Timeout corto para REST: una conexión inactiva no debe colgar horas.
      this.server.timeout = 2 * 60 * 1000; // 2 minutos
    }

    return this.app;
  }
}
