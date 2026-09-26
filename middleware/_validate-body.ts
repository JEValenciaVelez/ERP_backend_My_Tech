import { ErrorBadRequest } from 'config/errors';

import { Next, Request, Response } from '@/app/types.d';

/** Todo POST llega como `{ data: {...} }`. */
export default async function (req: Request, _: Response, next: Next) {
  req.requestStartTime = Date.now();
  req.ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (req.method != 'POST') {
    return next();
  }

  if (!req.body) {
    throw new ErrorBadRequest({ code: 'invalid.body' });
  }

  if (typeof req.body.data != 'object') {
    throw new ErrorBadRequest({ code: 'invalid.body' });
  }

  next();
}
