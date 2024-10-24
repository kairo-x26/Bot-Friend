import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@bot-friend/shared';
import type { UserRow } from '../db/schema.js';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';

/** Route does not require a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires one of the given roles (checked after authentication). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export type AuthUser = UserRow;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
