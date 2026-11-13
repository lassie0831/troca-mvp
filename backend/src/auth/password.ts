import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

// OWASP-recommended scrypt parameters (N=2^17, r=8, p=1) – ~64 MiB, tens of ms per hash.
const PARAMS = { N: 2 ** 17, r: 8, p: 1, keylen: 64 };
const maxmem = 256 * 1024 * 1024;

/** Format: scrypt$N$r$p$saltB64$hashB64 – parameters are stored so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A precomputed hash used to keep login timing constant when the e-mail does not exist. */
export const DUMMY_HASH_PROMISE = hashPassword(randomBytes(16).toString('hex'));
