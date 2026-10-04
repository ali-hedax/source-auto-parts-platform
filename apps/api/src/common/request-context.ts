import { AsyncLocalStorage } from 'node:async_hooks';

export interface Actor {
  userId: string;
  kind: 'CUSTOMER' | 'STAFF';
  sessionId: string;
  sessionTokenHash: string;
  authVersion: number;
  mfaVerified: boolean;
  permissions: ReadonlySet<string>;
  isOwner: boolean;
  requiresMfa: boolean;
  /** Approved customer group only; pending/self-declared groups are null. */
  approvedCustomerGroupId: string | null;
  displayName: string | null;
  locale: 'fa' | 'en';
}

export interface RequestContext {
  requestId: string;
  ipHash: string | null;
  actor: Actor | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}

export function currentActor(): Actor | null {
  return storage.getStore()?.actor ?? null;
}
