// Shared keyword-alert matching — used by BOTH the admin create-discount path
// and the scraped ingest pipeline so the two can never drift. Pure + strip-safe
// (no enums/decorators) so the .mjs adapters and the .ts server actions import
// it the same way.

export function normalizeForAlert(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

export interface AlertLike {
  keyword: string;
  supermarkets: string[];
  category: string | null;
  // number | string | Prisma Decimal (has toString) | null — Number()'d below.
  maxPrice: number | string | { toString(): string } | null;
}

export interface DiscountLike {
  productName: string;
  supermarket: string;
  category?: string | null;
  discountedPrice: number;
}

// Does this discount satisfy the alert's filters? (Cooldown/lastTriggeredAt is
// stateful and stays in the caller — this is the pure predicate.)
export function alertMatchesDiscount(alert: AlertLike, d: DiscountLike): boolean {
  const name = normalizeForAlert(d.productName);
  if (!name.includes(normalizeForAlert(alert.keyword))) return false;
  if (alert.supermarkets.length && !alert.supermarkets.includes(d.supermarket)) return false;
  if (alert.category && alert.category !== d.category) return false;
  if (alert.maxPrice != null && Number(d.discountedPrice) > Number(alert.maxPrice)) return false;
  return true;
}
