import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { ErrorCode, type UserRole } from '@bot-friend/shared';
import { ApiError } from '../common/api-error.js';
import { DB, type Db } from '../db/database.js';
import { users } from '../db/schema.js';
import { IS_PUBLIC, ROLES, type AuthUser } from './decorators.js';
import { TokenService } from './token.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw ApiError.unauthenticated();

    const claims = await this.tokens.verify(token);
    if (!claims) throw ApiError.unauthenticated('Your session has expired. Sign in again.');

    const [user] = await this.db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
    if (!user || user.sessionVersion !== claims.sv) {
      throw ApiError.unauthenticated('Your session has expired. Sign in again.');
    }
    if (user.status === 'deleting' || user.status === 'deleted') {
      throw new ApiError(ErrorCode.AccountDeleted, 'This account has been deleted');
    }
    if (user.status === 'suspended') {
      throw ApiError.forbidden('This account is suspended. Contact support.');
    }
    req.user = user;
    this.touch(user);

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw ApiError.forbidden();
    return true;
  }

  /** Coarse last-seen tracking (at most every 10 minutes per user) for admin views and retention. */
  private touch(user: AuthUser) {
    const now = Date.now();
    if (user.lastSeenAt && now - user.lastSeenAt.getTime() < 10 * 60_000) return;
    void this.db
      .update(users)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(users.id, user.id))
      .catch(() => undefined);
  }
}
