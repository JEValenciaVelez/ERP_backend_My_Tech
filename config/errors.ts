import langsJson from '../assets/langs';
import { HTTP_STATUS } from './constants';

export type ErrorCode = keyof typeof langsJson;

interface IErrorProps {
  code: ErrorCode;
  message?: string;
  debugInfo?: any;
  codeArgs?: any[];
  errors?: any[];
  err?: any;
}

class ErrorBase extends Error {
  public code: string | null;
  public status: number;
  public message: string;
  public stack?: string = '';
  public codeArgs?: any[];
  public errors?: any[];
  public err?: any;
  constructor({ code, message, codeArgs, errors, err }: IErrorProps) {
    super(message || '');
    this.code = code;
    this.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    this.message = message || '';
    if (errors) {
      this.errors = errors;
    }
    if (err) {
      this.err = err;
    }
    if (codeArgs) {
      this.codeArgs = codeArgs;
    }
  }
}

export class ErrorNotFound extends ErrorBase {
  public status: number = HTTP_STATUS.NOT_FOUND;
}

export class ErrorBadRequest extends ErrorBase {
  public status: number = HTTP_STATUS.BAD_REQUEST;
}

export class ErrorUnauthorized extends ErrorBase {
  public status: number = HTTP_STATUS.UNAUTHORIZED;
}

export class ErrorForbidden extends ErrorBase {
  public status: number = HTTP_STATUS.FORBIDDEN;
}

export class ErrorServer extends ErrorBase {
  public status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
}

export class ErrorConflict extends ErrorBase {
  public status: number = HTTP_STATUS.CONFLICT;
}

export class ErrorBadGateway extends ErrorBase {
  public status: number = HTTP_STATUS.BAD_GATEWAY;
}

/**
 * 429. `retryAfter` en segundos: isect lo convierte en la cabecera Retry-After,
 * para que el cliente sepa cuánto esperar sin adivinarlo.
 */
export class ErrorTooManyRequests extends ErrorBase {
  public status: number = HTTP_STATUS.TOO_MANY_REQUESTS;
  public retryAfter: number;
  constructor(props: IErrorProps & { retryAfter: number }) {
    super(props);
    this.retryAfter = props.retryAfter;
  }
}

export class ErrorServiceUnavailable extends ErrorBase {
  public status: number = HTTP_STATUS.SERVICE_UNAVAILABLE;
}
