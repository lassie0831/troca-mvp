import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundDistanceKm, sampleFuzzOffset } from '../../src/locations/privacy.js';

describe('sampleFuzzOffset', () => {
  it('always stays within [min, max] metres and [0, 360) degrees', () => {
    for (let i = 0; i < 20_000; i++) {
      const { distanceM, bearingDeg } = sampleFuzzOffset(200, 1000);
      assert.ok(distanceM >= 200 && distanceM <= 1000, `distance ${distanceM}`);
      assert.ok(bearingDeg >= 0 && bearingDeg < 360, `bearing ${bearingDeg}`);
    }
  });

  it('is uniform by area (not clustered near the minimum radius)', () => {
    const n = 40_000;
    const min = 200;
    const max = 1000;
    // Split the annulus in two rings of equal AREA; each should get ~50% of the samples.
    const midRadius = Math.sqrt((min * min + max * max) / 2);
    let inner = 0;
    for (let i = 0; i < n; i++) if (sampleFuzzOffset(min, max).distanceM < midRadius) inner++;
    const share = inner / n;
    assert.ok(Math.abs(share - 0.5) < 0.02, `inner share ${share}`);
  });

  it('maps the random source to the expected extremes', () => {
    assert.equal(sampleFuzzOffset(200, 1000, () => 0).distanceM, 200);
    assert.ok(Math.abs(sampleFuzzOffset(200, 1000, () => 0.999_999_999).distanceM - 1000) < 0.01);
  });

  it('rejects invalid bounds', () => {
    assert.throws(() => sampleFuzzOffset(1000, 200), RangeError);
    assert.throws(() => sampleFuzzOffset(-1, 200), RangeError);
  });
});

describe('roundDistanceKm', () => {
  const cases: [number, number][] = [
    [0, 0.5],
    [120, 0.5],
    [749, 0.5],
    [750, 1],
    [1_240, 1],
    [1_250, 1.5],
    [3_400, 3.5],
    [12_760, 13],
  ];
  for (const [m, km] of cases) {
    it(`${m} m -> ${km} km`, () => assert.equal(roundDistanceKm(m), km));
  }

  it('always returns a multiple of 0.5', () => {
    for (let m = 0; m < 60_000; m += 37) assert.equal((roundDistanceKm(m) * 2) % 1, 0);
  });
});
