import util from 'util';

import { Next, Request, Response } from '@/app/types.d';
import { DEFAULT_LANG } from '@/config/env.config';

import langs from '../assets/langs';

export default () => {
  return function (req: Request, _: Response, next: Next) {
    const translate = function (key: keyof typeof langs, ...args: any[]) {
      const lang = (req.headers['content-language'] || DEFAULT_LANG) as unknown as 'es' | 'en';

      if (langs[key] && langs[key][lang]) return util.format(langs[key][lang], ...args);

      return util.format(key, ...args);
    };

    req.translate = translate;
    next();
  };
};
