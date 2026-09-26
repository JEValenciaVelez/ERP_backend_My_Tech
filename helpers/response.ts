import crypto from 'crypto';
import moment from 'moment';

import { Next, Request, Response } from '@/app/types.d';
import { HTTP_STATUS } from '@/config/constants';

import Logger from './logger-pino';

const SALT = 'erp-integrity';

type ErrorResponseBase = {
  err?: any;
  status: number;
  errorCode?: string;
  debugInfo?: string;
  data?: any;
  codeArgs?: (string | number)[];
  message?: string;
  code?: string;
};

interface IErrorResponseWithMessage extends ErrorResponseBase {
  message: string;
}

interface IErrorResponseWithCode extends ErrorResponseBase {
  code: string;
}

interface IUserResponse {
  [key: string]: any;
}

export default function (res: Response, req: Request, next: Next | null = null) {
  return function (
    response?: IUserResponse | null,
    error: IErrorResponseWithMessage | IErrorResponseWithCode | null = null
  ) {
    if (error) {
      const date = moment().format('DD/MM/YY HH:mm:ss');
      if (error.err?.stack) {
        Logger.logError({
          error: error.err,
          method: 'finalResponse',
          userId: req.staff?.id,
          path: req.originalUrl,
          body: req.body,
          headers: req.headers,
        });
      }

      let shasum = crypto.createHash('sha1');
      shasum.update(`${date}+${SALT}`);
      let integrity = shasum.digest('hex');

      let errorObj = {
        debugInfo: '',
        message: '',
        statusCode: error.status,
        path: req.originalUrl,
        date,
        errorCode: error.code,
        integrity,
        errors: error.err?.errors,
      };

      if (error.err && error.err.code) {
        errorObj.errorCode = error.err.code;
      }

      if (error.err && error.err.codeArgs) {
        error.codeArgs = error.err.codeArgs;
      }

      if (error.err && error.err.status && error.err.message) {
        errorObj.message = error.err.message;
      } else {
        errorObj.message =
          req && errorObj.errorCode
            ? req.translate(errorObj.errorCode, ...(error.codeArgs || []))
            : error.errorCode || error.message || '';
      }

      if (error.err && error.err.sql) {
        Logger.logQuery({
          type: 'ErrorQuery',
          ms: req.startTime ? Date.now() - req.startTime : 0,
          sql: error.err.sql,
          description: error.err.original.sqlMessage,
          name: error.err.name,
          userId: req.staff?.id,
          path: req.originalUrl,
        });
      }

      if (errorObj.errors && req.translate) {
        const translatedErrors: any = {};
        for (const [field, errorCodes] of Object.entries(errorObj.errors)) {
          if (!Array.isArray(errorCodes)) continue;
          translatedErrors[field] = (errorCodes as string[]).map((code) => {
            // Check if error code contains args (format: "code|arg1|arg2|...")
            if (code.includes('|')) {
              const parts = code.split('|');
              const errorCode = parts[0];
              const args = parts.slice(1);
              return req.translate?.(errorCode, ...args) || code;
            }
            return req.translate?.(code) || code;
          });
        }
        errorObj.errors = translatedErrors;
      }

      if (error.debugInfo) {
        errorObj.debugInfo = error.debugInfo;
      }

      if (req.logger) {
        req.logger.setRes(errorObj);
        req.logger.save();
      }
      res.status(error.status).json(errorObj);
      if (next) return next();
      else return;
    }

    let responseObj = {
      statusCode: HTTP_STATUS.OK,
      message: req && req.translate ? req.translate('server.ok') : 'Successful',
      data: response,
      _channel: 'web',
    };
    if (req.logger) {
      req.logger.setRes(responseObj);
      req.logger.save();
    }
    res.status(HTTP_STATUS.OK).json(responseObj);
    if (next) return next();
  };
}

export function success(res: Response, response?: IUserResponse | null) {
  res.status(HTTP_STATUS.OK).json({
    statusCode: HTTP_STATUS.OK,
    message: 'Successful',
    data: response,
    _channel: 'web',
  });
}
