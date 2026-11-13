import { loadEnv } from '../config/env.js';

let limit: number | undefined;

/**
 * Stricter rate limit for credential endpoints (brute force / credential stuffing).
 * @Throttle() needs a static object, so the configured value is resolved lazily on first request.
 */
export const AUTH_THROTTLE = {
  default: { limit: () => (limit ??= loadEnv().AUTH_RATE_LIMIT_PER_MINUTE), ttl: 60_000 },
};
