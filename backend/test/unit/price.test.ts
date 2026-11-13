import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPriceCompatible, symmetricPriceWindow } from '../../src/matching/price.js';

describe('symmetricPriceWindow', () => {
  it('computes [p/1.2, p*1.2] for 20%', () => {
    assert.deepEqual(symmetricPriceWindow(10_000, 20), { minCents: 8_334, maxCents: 12_000 });
  });

  it('rejects invalid input', () => {
    assert.throws(() => symmetricPriceWindow(0, 20), RangeError);
    assert.throws(() => symmetricPriceWindow(10.5, 20), RangeError);
    assert.throws(() => symmetricPriceWindow(100, 0), RangeError);
  });
});

describe('isPriceCompatible', () => {
  it('accepts the exact boundaries', () => {
    assert.equal(isPriceCompatible(10_000, 12_000, 20), true);
    assert.equal(isPriceCompatible(12_000, 10_000, 20), true);
  });

  it('is NOT the naive ±20%: 100 vs 80 differs by 25% from the cheaper side', () => {
    assert.equal(isPriceCompatible(10_000, 8_000, 20), false);
    assert.equal(isPriceCompatible(8_000, 10_000, 20), false);
  });

  it('is symmetric for every pair (property test)', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 50_000; i++) {
      const a = 100 + Math.floor(rand() * 1_000_000);
      const b = Math.max(100, Math.floor(a * (0.7 + rand() * 0.6)));
      const tol = 1 + Math.floor(rand() * 50);
      assert.equal(isPriceCompatible(a, b, tol), isPriceCompatible(b, a, tol), `a=${a} b=${b} tol=${tol}`);
    }
  });

  it('matches the real-number definition |a-b| <= t*min(a,b)', () => {
    for (let a = 100; a < 3_000; a += 7) {
      for (let b = 100; b < 3_000; b += 11) {
        const expected = Math.abs(a - b) * 100 <= 20 * Math.min(a, b);
        assert.equal(isPriceCompatible(a, b, 20), expected, `a=${a} b=${b}`);
      }
    }
  });
});
