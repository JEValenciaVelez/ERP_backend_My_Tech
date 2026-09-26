import { Next, Request, Response } from '@/app/types.d';
import { HTTP_STATUS } from '@/config/constants';
import { requestContext } from '@/helpers/requestContext';

import response from './response';

export const isect = (controller: Controller) => {
  return async (req: Request<any>, res: Response, next: Next) => {
    if (res.headersSent) return;
    try {
      req.startTime = Date.now();

      return await requestContext.run(
        {
          req,
          functionName: controller.name,
        },
        async () => await controller(req, res, next)
      );
    } catch (err: any) {
      // check if its custom error
      if (err.status && err.code) {
        if (typeof err.retryAfter === 'number') res.header('Retry-After', String(err.retryAfter));
        return response(res, req)(null, {
          status: err?.status,
          code: err?.code,
          codeArgs: err?.codeArgs,
          err,
          debugInfo: err?.debugInfo,
        });
      }
      return response(res, req)(null, {
        err,
        message: err?.message,
        status: err?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: 'server.error',
        debugInfo: err?.debugInfo,
      });
    }
  };
};

type Controller = (req: Request<any>, res: Response, next: Next) => Promise<void> | void;

interface IModule {
  default?: Controller;
  validators?: Controller[] | any[];
}

export const create = async (
  r: any,
  path: string,
  m: Promise<IModule>,
  validators: Controller[] = []
) => {
  const module = await m;
  if (!module.default) {
    throw new Error(`Module ${path} does not have a default export`);
  }
  validators = [...validators, ...(module.validators ?? [])].map((v) => isect(v));
  r.post(path, validators, isect(module.default));
};

export default isect;
