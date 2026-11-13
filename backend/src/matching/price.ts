/**
 * Symmetric price matching.
 *
 * Two items A and B are compatible when EACH price is within ±tolerance of the other:
 *   B ≤ A·(1+t)  and  A ≤ B·(1+t)   ⟺   A/(1+t) ≤ B ≤ A·(1+t)
 *
 * This makes the relation mutual: if A sees B in its feed, B also sees A.
 * (A naive "B within A ± 20%" is NOT mutual: 100 would match 80, but 80 would not match 100.)
 *
 * All values are integer cents; the window is computed with integer arithmetic so the
 * boundary behaviour is exact and identical in the API and in SQL.
 */
export interface PriceWindow {
  minCents: number;
  maxCents: number;
}

export function symmetricPriceWindow(priceCents: number, tolerancePct: number): PriceWindow {
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new RangeError('priceCents must be a positive integer');
  if (!Number.isInteger(tolerancePct) || tolerancePct <= 0) throw new RangeError('tolerancePct must be a positive integer');
  const factor = 100 + tolerancePct;
  return {
    minCents: Math.ceil((priceCents * 100) / factor),
    maxCents: Math.floor((priceCents * factor) / 100),
  };
}

export function isPriceCompatible(aCents: number, bCents: number, tolerancePct: number): boolean {
  const { minCents, maxCents } = symmetricPriceWindow(aCents, tolerancePct);
  return bCents >= minCents && bCents <= maxCents;
}
