import 'reflect-metadata';
import { Logger, ValidationPipe, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { Database } from './database/database.service.js';
import { migrate } from './database/migrate.js';
import { LocalStorageService, StorageService } from './storage/storage.service.js';

export const API_PREFIX = 'v1';

export async function createApp(env: Env, opts: { logger?: LogLevel[] | false } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: opts.logger ?? (env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined),
  });

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()) });
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  app.enableShutdownHooks();

  const storage = app.get(StorageService);
  if (storage instanceof LocalStorageService) {
    app.useStaticAssets(storage.root, { prefix: '/uploads/', immutable: true, maxAge: '365d', index: false });
  }

  if (env.MIGRATE_ON_START) {
    await migrate(app.get(Database).pool, (m) => Logger.log(m, 'Migrations'));
  }
  return app;
}
