import { BadRequestException } from '@nestjs/common';

/** Opaque keyset-pagination cursor (base64url JSON). */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string | undefined,
  validate: (v: Record<string, unknown>) => v is T,
): T | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (value && typeof value === 'object' && validate(value)) return value;
  } catch {
    /* fall through */
  }
  throw new BadRequestException('Invalid cursor');
}
