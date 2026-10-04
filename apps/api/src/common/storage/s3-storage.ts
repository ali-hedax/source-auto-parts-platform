import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage.js';

export interface S3Config {
  endpoint: string;
  region: string;
  privateBucket: string;
  publicBucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3-compatible storage (any provider exposing the S3 API). The private bucket
 * must have no public policy; the public bucket only receives re-encoded
 * product images. Not exercised in this environment (no bucket configured).
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.privateBucket, Key: key, Body: body, ContentType: contentType }));
  }

  async getPrivate(key: string): Promise<Readable> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.privateBucket, Key: key }));
    return out.Body as Readable;
  }

  async readPrivate(key: string): Promise<Buffer> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.privateBucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    return Buffer.from(bytes ?? new Uint8Array());
  }

  async deletePrivate(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.privateBucket, Key: key }));
  }

  async putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.publicBucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
    );
    return `${this.cfg.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  async deletePublic(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.publicBucket, Key: key }));
  }

  async signedPrivateUrl(key: string, filename: string, ttlSeconds: number): Promise<string | null> {
    const safeName = encodeURIComponent(filename);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.cfg.privateBucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${safeName}`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async ping(): Promise<boolean> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.privateBucket }));
    return true;
  }
}
