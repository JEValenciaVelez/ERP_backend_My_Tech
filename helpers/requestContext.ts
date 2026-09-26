import { AsyncLocalStorage } from 'async_hooks';

import { Request } from '@/app/types.d';

export const requestContext = new AsyncLocalStorage<{
  req: Request;
  functionName: string;
}>();
