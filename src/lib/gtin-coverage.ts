// Is a chain's supplemental GTIN source still delivering barcodes?
//
// Wolt is the ONLY GTIN source for the chains whose own feeds are SKU-only
// (masoutis, ab, mymarket, sklavenitis). When Wolt silently stopped exposing
// `barcode_gtin` for Sklavenitis some time before 2026-08-23, the weekly job
// kept succeeding on 34 barcodes out of 3,516 items and nobody noticed for
// months — the run "worked", it just stopped being worth anything. Coverage
// rot is therefore its own failure class, separate from a scrape failing.

export type GtinCoverage = 'ok' | 'below-floor' | 'unknown';

// A run that scraped nothing tells us nothing about the barcode source — that
// is a scrape failure, already alarmed elsewhere, and double-reporting it here
// would just point at the wrong cause.
export function evaluateGtinRate(seen: number, withGtin: number, floor: number): GtinCoverage {
  if (!Number.isFinite(seen) || seen <= 0) return 'unknown';
  if (!Number.isFinite(floor) || floor <= 0) return 'ok'; // gate deliberately disabled
  return withGtin / seen < floor ? 'below-floor' : 'ok';
}

export function formatGtinRate(seen: number, withGtin: number): string {
  if (seen <= 0) return 'n/a';
  return `${((withGtin / seen) * 100).toFixed(1)}%`;
}
