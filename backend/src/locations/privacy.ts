import { randomInt } from 'node:crypto';

export interface FuzzOffset {
  /** Displacement distance in metres. */
  distanceM: number;
  /** Bearing in degrees, clockwise from north, [0, 360). */
  bearingDeg: number;
}

/** Cryptographically secure uniform float in [0, 1). */
function secureRandom(): number {
  return randomInt(0, 2 ** 48 - 1) / 2 ** 48;
}

/**
 * Picks a random displacement uniformly distributed over the AREA of the annulus [minM, maxM].
 *
 * - Uniform by area (sqrt) rather than by radius, otherwise points cluster near the minimum distance.
 * - The minimum distance guarantees the public point is never (almost) the real position.
 * - Uses a CSPRNG so offsets cannot be predicted.
 */
export function sampleFuzzOffset(minM: number, maxM: number, rand: () => number = secureRandom): FuzzOffset {
  if (minM < 0 || maxM <= minM) throw new RangeError('expected 0 <= minM < maxM');
  const u = rand();
  const distanceM = Math.sqrt(u * (maxM * maxM - minM * minM) + minM * minM);
  const bearingDeg = rand() * 360;
  return { distanceM, bearingDeg };
}

/**
 * Distance shown to users: rounded to the nearest 0.5 km, never below 0.5 km
 * (showing "0 km" would suggest the other person is next door).
 */
export function roundDistanceKm(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new RangeError('distanceM must be a non-negative number');
  return Math.max(0.5, Math.round(distanceM / 500) / 2);
}
