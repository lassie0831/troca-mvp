import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LocalStorageService, S3StorageService, StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ENV],
      useFactory: (env: Env) => (env.STORAGE_DRIVER === 's3' ? new S3StorageService(env) : new LocalStorageService(env)),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
