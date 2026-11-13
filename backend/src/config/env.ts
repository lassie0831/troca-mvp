import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    /**
     * Public base URL of this API, used to build absolute URLs for files served by the local storage driver.
     * If unset, those URLs are relative ("/uploads/...") and clients resolve them against the API URL they use.
     */
    API_PUBLIC_URL: z.url().optional(),
    CORS_ORIGINS: z.string().default('*'),
    /** Express "trust proxy" setting; set to 1 behind a single reverse proxy / load balancer. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_SSL: bool.default(false),
    MIGRATE_ON_START: bool.default(false),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must have at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./uploads'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),
    /** If set (e.g. a CDN / R2 public domain), photo URLs are built from it; otherwise presigned GET URLs are used. */
    STORAGE_PUBLIC_BASE_URL: z.string().optional(),

    /** Price matching tolerance in percent (20 = ±20%, applied symmetrically). */
    PRICE_TOLERANCE_PCT: z.coerce.number().int().min(1).max(100).default(20),
    FEED_MAX_RADIUS_KM: z.coerce.number().int().positive().default(50),
    /** Public position is displaced between MIN and MAX metres from the exact position. */
    LOCATION_FUZZ_MIN_M: z.coerce.number().int().min(0).default(200),
    LOCATION_FUZZ_MAX_M: z.coerce.number().int().positive().default(1000),
    /** A new item registered within this distance of an existing location of the same user reuses its fuzzed point. */
    LOCATION_ANCHOR_REUSE_M: z.coerce.number().int().positive().default(500),
    MAX_PHOTOS_PER_ITEM: z.coerce.number().int().positive().default(6),
  })
  .superRefine((env, ctx) => {
    if (env.LOCATION_FUZZ_MIN_M >= env.LOCATION_FUZZ_MAX_M) {
      ctx.addIssue({ code: 'custom', path: ['LOCATION_FUZZ_MIN_M'], message: 'must be lower than LOCATION_FUZZ_MAX_M' });
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** DI token for the validated environment. */
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
