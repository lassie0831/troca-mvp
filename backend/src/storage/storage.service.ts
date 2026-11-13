import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ENV, type Env } from '../config/env.js';

/**
 * Object storage abstraction.
 * - `s3`: any S3-compatible service (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces…).
 * - `local`: files on disk served by the API under /uploads (development / demos only).
 */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract deleteMany(keys: string[]): Promise<void>;
  abstract url(key: string): Promise<string>;
}

@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.bucket = env.S3_BUCKET!;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable', // keys are never reused
      }),
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      if (!chunk.length) continue;
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
      );
    }
  }

  async url(key: string): Promise<string> {
    if (this.env.STORAGE_PUBLIC_BASE_URL) return `${this.env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 });
  }
}

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  readonly root: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.root = path.resolve(env.LOCAL_STORAGE_DIR);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((k) => rm(this.resolve(k), { force: true }).catch((e) => this.logger.warn(`delete ${k}: ${e}`))),
    );
  }

  async url(key: string): Promise<string> {
    const base = this.env.API_PUBLIC_URL?.replace(/\/$/, '') ?? '';
    return `${base}/uploads/${key}`;
  }
}
