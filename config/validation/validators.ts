import { ErrorBadRequest } from 'config/errors';
import { z } from 'zod';

import { Request } from '@/app/types.d';

/* //!  IMPORTANT!!!! 
All validations performed by this function throw an error if the field is not valid. THIS ERROR MUST BE HANDLED BY THE isect inside a try/catch block.
*/

function validateObject<Schema extends z.ZodSchema<any>>({
  schema,
  object,
}: IValidateObject<Schema>): z.infer<Schema> {
  const zodValidation = schema.safeParse(object);

  if (!zodValidation.success) {
    const firstError = zodValidation.error.issues[0].message;
    const errors = z.flattenError(zodValidation.error).fieldErrors;

    // Check if error message contains args (format: "code|arg1|arg2|...")
    let errorCode = firstError;
    let codeArgs;
    if (firstError.includes('|')) {
      const parts = firstError.split('|');
      errorCode = parts[0];
      codeArgs = parts.slice(1);
    }

    throw new ErrorBadRequest({
      code: errorCode as any,
      errors: errors as any,
      codeArgs,
    });
  }

  return zodValidation.data;
}

export function validateRequest<Schema extends z.ZodSchema<any>>({
  schema,
  req,
  target = 'data',
}: IValidateReq<Schema>): z.infer<Schema> {
  return validateObject({ schema, object: target === 'data' ? req.body.data : req[target] });
}

// ============================= Definitions ============================= //
type IValidateReq<Schema extends z.ZodSchema<any>> = {
  target?: 'body' | 'query' | 'params' | 'data';
  schema: Schema;
  req: Request;
};

type IValidateObject<Schema extends z.ZodSchema<any>> = {
  schema: Schema;
  object: any;
};
