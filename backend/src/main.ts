import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.PORT, '0.0.0.0');
Logger.log(`API listening on :${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');
