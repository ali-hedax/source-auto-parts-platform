import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@hedax/domain';
import type { Actor } from '../request-context.js';
import { unauthorized } from '../errors.js';

export const IS_PUBLIC = 'hedax:public';
export const ACTOR_KIND = 'hedax:actor-kind';
export const PERMISSIONS_KEY = 'hedax:permissions';
export const SKIP_CSRF = 'hedax:skip-csrf';

/** Route is reachable without a session (an actor is still attached when present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const CustomerOnly = () => SetMetadata(ACTOR_KIND, 'CUSTOMER');
export const StaffOnly = () => SetMetadata(ACTOR_KIND, 'STAFF');
/** Staff route requiring *all* listed permissions. Data scope is still checked in services. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
/** Only for provider server-to-server callbacks, which are verified by the provider adapter instead. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<{ actor?: Actor | null }>();
  if (!req.actor) throw unauthorized();
  return req.actor;
});

export const OptionalActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | null => {
  return ctx.switchToHttp().getRequest<{ actor?: Actor | null }>().actor ?? null;
});
