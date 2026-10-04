import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage.js';

const KEY_RE = /^[a-z0-9][a-z0-9/_-]{8,190}(\.[a-z0-9]{2,5})?$/;

/**
 * Development storage on the local disk. Private files live outside any web
 * root and are only readable through the API. Keys are validated to prevent
 * path traversal even though they are always server-generated.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly privateDir: string;
  private readonly publicDir: string;

  constructor(
    baseDir: string,
    private readonly publicBaseUrl: string,
  ) {
    const root = path.resolve(baseDir);
    this.privateDir = path.join(root, 'private');
    this.publicDir = path.join(root, 'public');
  }

  private resolve(dir: string, key: string): string {
    if (!KEY_RE.test(key) || key.includes('..')) throw new Error('Invalid storage key');
    const full = path.resolve(dir, key);
    if (!full.startsWith(dir + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async putPrivate(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(this.privateDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { mode: 0o600 });
  }

  async getPrivate(key: string): Promise<Readable> {
    const file = this.resolve(this.privateDir, key);
    await stat(file);
    return createReadStream(file);
  }

  async readPrivate(key: string): Promise<Buffer> {
    return readFile(this.resolve(this.privateDir, key));
  }

  async deletePrivate(key: string): Promise<void> {
    await rm(this.resolve(this.privateDir, key), { force: true });
  }

  async putPublic(key: string, body: Buffer): Promise<string> {
    const file = this.resolve(this.publicDir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  async deletePublic(key: string): Promise<void> {
    await rm(this.resolve(this.publicDir, key), { force: true });
  }

  async signedPrivateUrl(): Promise<string | null> {
    return null; // always stream through the API in local mode
  }

  async ping(): Promise<boolean> {
    await mkdir(this.privateDir, { recursive: true });
    await mkdir(this.publicDir, { recursive: true });
    return true;
  }

  publicPath(key: string): string {
    return this.resolve(this.publicDir, key);
  }
}
