import type { Readable } from 'node:stream';

/**
 * Two separate spaces (spec §11): a PRIVATE store for customer files and
 * documents (never publicly reachable; downloaded only through authorized
 * streaming or short-lived signed URLs) and a PUBLIC store for approved,
 * re-encoded product images.
 */
export interface StorageDriver {
  readonly name: string;
  putPrivate(key: string, body: Buffer, contentType: string): Promise<void>;
  getPrivate(key: string): Promise<Readable>;
  readPrivate(key: string): Promise<Buffer>;
  deletePrivate(key: string): Promise<void>;
  putPublic(key: string, body: Buffer, contentType: string): Promise<string>;
  deletePublic(key: string): Promise<void>;
  /** Short-lived signed download URL when the backend supports it; null → stream through the API. */
  signedPrivateUrl(key: string, filename: string, ttlSeconds: number): Promise<string | null>;
  ping(): Promise<boolean>;
}

export const STORAGE = Symbol('HEDAX_STORAGE');
