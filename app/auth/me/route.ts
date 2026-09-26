import { toStaff } from '@/app/staff/staff.shared';
import { Next, Request, Response } from '@/app/types.d';
import response from '@/helpers/response';

export default async function (req: Request, res: Response, next: Next) {
  return response(res, req, next)(toStaff(req.staff!));
}
