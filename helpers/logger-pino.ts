import moment from 'moment';
import pino from 'pino';

import { Request } from '@/app/types.d';
import { API_TOKEN_PINO, NODE_ENV } from '@/config/env.config';

/**
 * Axiom solo en entornos desplegados y con token. En desarrollo pino escribe a
 * stdout: los transports de pino levantan worker threads que no resuelven
 * dentro del bundle de esbuild, así que crearlos siempre impedía arrancar.
 */
const USE_AXIOM = ['production', 'sandbox'].includes(NODE_ENV) && !!API_TOKEN_PINO;

function buildLogger(dataset: string, token = API_TOKEN_PINO) {
  if (!USE_AXIOM) return pino({ level: 'info' });

  const transport = pino.transport({
    target: '@axiomhq/pino',
    options: { dataset, token },
  });
  transport.on('error', (err: any) => {
    console.error('Error enviando a Axiom:', err);
  });
  return pino({ level: 'info' }, transport);
}

const logger = buildLogger('erp-providers', process.env.API_TOKEN_PINO_PROVIDERS || API_TOKEN_PINO);
const loggerErrors = buildLogger('erp-errors');
const loggerQueries = buildLogger('erp-queries');

export default class LoggerPino {
  static CENSOR_FIELDS = [
    'password',
    'authorization',
    'x-device-id',
    'x-access-token',
    'cvv',
    'confirmPassword',
    'token',
    'pin',
    'otp',
  ];

  private data: {
    request?: string | null;
    response?: string | null;
    start_request?: string | null;
    end_request?: string | null;
    response_time?: number | null;
    transactionId?: string | null;
    metaData?: string | null;
    response_raw?: string | null;
    provider?: string | null;
    rawUrl?: string | null;
    userResponse?: string | null;
    userId?: string | null;
    businessId?: string | null;
  } = {};

  constructor(transactionId: string | null, provider?: string) {
    this.data.transactionId = transactionId;
    this.data.provider = provider;
  }

  setReq(request: Request) {
    this.data.rawUrl = request.url;
    this.data.userId = request.staff?.id;
  }

  setRes(response: any) {
    this.data.userResponse = LoggerPino.getJSONString(response);
  }

  logRequest(log: any) {
    this.data.request = LoggerPino.getJSONString(log);
    this.data.start_request = moment().format('YYYY-MM-DD HH:mm:ss');
  }

  logResponse(log: any) {
    this.data.response = LoggerPino.getJSONString(log);
    this.data.end_request = moment().format('YYYY-MM-DD HH:mm:ss');
    this.data.response_time = moment().diff(moment(this.data.start_request), 'milliseconds');
  }

  save() {
    if (NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('logger-pino', this.data);
    } else {
      logger.info(this.data);
    }
  }

  logRawResponse(log: any) {
    this.data.response_raw = LoggerPino.getJSONString(log);
    this.data.end_request = moment().format('YYYY-MM-DD HH:mm:ss');
    this.data.response_time = moment().diff(moment(this.data.start_request), 'milliseconds');
  }

  static getJSONString(data: any) {
    try {
      let type = typeof data;
      if (['string', 'number', 'boolean', 'undefined'].includes(type)) {
        return data;
      }
      return JSON.stringify(data || '', (key, value) => {
        let keyLower = `${key}`.toLocaleLowerCase();
        if (LoggerPino.CENSOR_FIELDS.includes(keyLower) || LoggerPino.CENSOR_FIELDS.includes(key)) {
          return '****';
        }

        return value;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('getJSONString', err);
      return '';
    }
  }

  static logQuery(data: {
    type: 'metaDataBlocking' | 'LowQuery' | 'ErrorQuery';
    ms: number;
    sql: string;
    description?: string;
    name?: string;
    userId?: string;
    businessId?: string;
    path?: string;
    ip?: string;
    functionName?: string;
    meta?: {
      [key: string]: string;
    };
  }) {
    if (NODE_ENV !== 'production') {
      console.warn('long-query-log', moment().format('DD/MM/YY HH:mm:ss'), data);
    } else {
      let levels = {
        metaDataBlocking: 'info',
        LowQuery: 'warn',
        ErrorQuery: 'error',
      } as const;
      loggerQueries[levels[data.type]](data);
    }
  }

  static logError(data: {
    error: any;
    method: string;
    businessId?: string | null;
    userId?: string | null;
    transactionId?: string | null;
    providerId?: number | null;
    path?: string | null;
    body?: any;
    headers?: any;
    productId?: number | null;
  }) {
    if (NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('error-log', moment().format('DD/MM/YY HH:mm:ss'), data.method, data.error);
    } else {
      let stack = data?.error?.stack || data?.error?.err?.stack || '';
      loggerErrors.error({
        ...data,
        error: LoggerPino.getJSONString(data.error),
        body: LoggerPino.getJSONString(data.body),
        headers: LoggerPino.getJSONString(data.headers),
        stack: LoggerPino.getJSONString(stack),
      });
    }
  }
}
