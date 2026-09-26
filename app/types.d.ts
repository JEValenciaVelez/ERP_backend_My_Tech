import type { Staff } from '@prisma/client';
import type { z } from 'zod';

import LoggerPino from '@/helpers/logger-pino';

interface IHeaders {
  'x-forwarded-for'?: string;
  'x-access-token'?: string;
  'x-device-id'?: string;
  'user-agent'?: string;
  'content-language'?: string;
  'content-type'?: string;
  'content-disposition'?: string;
  'content-length'?: string;
  host?: string;
  connection?: string;
  authorization?: string;
  origin?: string;
}

export type Request<
  Schema extends z.ZodObject<any> = z.ZodObject<any>,
  Target extends 'body' | 'query' | 'params' | 'data' = 'data',
> = {
  ipAddress: string;
  ip: string;
  requestStartTime: number;
  get(key: string): string;
  file?: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  };
  method: string;
  startTime: number;
  url: string;
  path: string;
  originalUrl: string;
  headers: IHeaders;
  connection: {
    remoteAddress: string;
  };
  query: (Target extends 'query' ? z.infer<Schema> : unknown) & {
    [key: string]: string;
  };
  body: (Target extends 'body' ? z.infer<Schema> : unknown) & {
    data: (Target extends 'data' ? z.infer<Schema> : unknown) & {
      [key: string]: any;
    };
    _channel?: string;
    _version?: string;
    _deviceId?: string;
    [key: string]: any;
  };
  params: (Target extends 'params' ? z.infer<Schema> : unknown) & Record<string, any>;

  // Lo puebla requireAuth a partir del access token.
  staff?: Staff;
  logger?: LoggerPino;

  translate(code: string, ...args: any[]): string;
};

export type Response = {
  headersSent: boolean;

  status(code: number): Response;
  send(data: string | Buffer | ArrayBufferLike): any;
  header(key: string, value: string): Response;
  json(data: any): Response;
  writeHead(code: number, headers: IHeaders): Response;
  end(data: any): any;
  type(type: string): Response;
  setHeader(key: string, value: string): Response;
};

export type Next = (err?: any) => void;
