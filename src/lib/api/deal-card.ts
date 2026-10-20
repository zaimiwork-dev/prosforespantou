// The deal shape the app API (/api/v1/…) sends to phones — the one contract
// every app screen is built on (APP_PLAN.md, 2026-10-20).
//
// Two rules:
//   1. The display decisions the website card makes (components/DiscountCard)
//      are made HERE, with the same library functions — name/size split, unit
//      price, the «κανονικά ~Y€» baseline, positive-only verdicts, department
//      for display, which image to show — so the app and the site cannot
//      disagree about a price. The app only draws.
//   2. Nothing time-dependent is precomputed. Expiry labels ("Λήγει αύριο")
//      depend on today, and a shopping list can sit on a phone for days, so
//      the app derives them from the raw dates with the shared expiryInfo().
//
// This is API v1: an installed app cannot be forced to update, so fields are
// only ever ADDED here, never renamed, retyped or removed. A breaking change
// is a v2.
import { baselineForCard } from '../baseline-price.ts';
import { isPositiveVerdict } from '../price-verdict.ts';
import { splitNameAndSize, unitPrice, type UnitPrice } from '../pack-info.ts';
import { displayCategoryForProduct } from '../display-category.js';

export const SITE_ORIGIN = 'https://prosforespantou.gr';

// Collection-method labels that must not reach a shopper ('wolt' is how a row
// was scraped, not something the chain published) — same set as the card.
const USER_FACING_SOURCES = new Set(['web', 'leaflet', 'manual']);

export type DealCard = {
  id: string;
  productId: string | null;
  chain: string | null;
  name: string;
  title: string;
  size: string | null;
  category: string;
  price: number;
  originalPrice: number | null;
  percent: number | null;
  unit: UnitPrice | null;
  baseline: { price: number; percent: number; checkedAt: string | null } | null;
  verdict: 'lowest' | 'good' | null;
  compareChains: number;
  isCheapest: boolean;
  imageUrl: string | null;
  validFrom: string;
  validUntil: string;
  datesFromSource: boolean;
  updatedAt: string;
  sources: string[];
  featured: { label: string } | null;
  essential: { id: string; label: string; chainCount: number } | null;
};

type Row = {
  id: string;
  productId?: string | null;
  supermarket?: string | null;
  productName?: string | null;
  category?: string | null;
  discountedPrice: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  priceVerdict?: string | null;
  baselinePrice?: number | null;
  baselineAt?: Date | string | null;
  impliedPercent?: number | null;
  comparisonCount?: number | null;
  isCheapestInCluster?: boolean | null;
  imageUrl?: string | null;
  validFrom: Date | string;
  validUntil: Date | string;
  datesFromSource?: boolean | null;
  // Optional because not every query selects it (get-similar-offers did not
  // until 2026-10-20); a missing one falls back to validFrom rather than
  // failing the whole response.
  updatedAt?: Date | string | null;
  source?: string | null;
  sources?: string[] | null;
  isFeatured?: boolean | null;
  featuredLabel?: string | null;
  product?: { name?: string | null; imageUrl?: string | null; unitInfo?: string | null } | null;
  essential?: { id: string; label: string; chainCount: number } | null;
};

const iso = (v: Date | string) => new Date(v).toISOString();

// Offer's own image first (it is the live pack at the chain selling it), then
// the catalogue product's; bare file names are legacy Wolt mirrors served by
// the site. Always absolute — the app has no origin to resolve against.
export function resolveImage(row: Pick<Row, 'imageUrl' | 'product'>): string | null {
  const raw = row.imageUrl || row.product?.imageUrl || null;
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/')) return `${SITE_ORIGIN}${raw}`;
  return `${SITE_ORIGIN}/wolt_images/${raw.split('/').pop()}`;
}

export function toDealCard(row: Row): DealCard {
  const name = row.productName || row.product?.name || '';
  const parts = splitNameAndSize(name);
  const price = row.discountedPrice;
  const original = row.originalPrice ?? null;
  const percent = row.discountPercent
    ?? (original && price ? Math.round((1 - price / original) * 100) : null);
  const unit = unitPrice(name, price)
    || (row.product?.unitInfo ? unitPrice(`${name} ${row.product.unitInfo}`, price) : null);
  const baseline = baselineForCard(row);
  const rawSources = row.sources && row.sources.length > 0 ? row.sources : (row.source ? [row.source] : []);

  return {
    id: row.id,
    productId: row.productId ?? null,
    chain: row.supermarket ?? null,
    name,
    title: parts.title,
    size: parts.size,
    category: displayCategoryForProduct(name, row.category ?? '') ?? row.category ?? '',
    price,
    originalPrice: original,
    percent: percent && percent > 0 ? percent : null,
    unit,
    baseline: baseline
      ? { price: baseline.price, percent: baseline.percent, checkedAt: baseline.checkedAt ? baseline.checkedAt.toISOString() : null }
      : null,
    verdict: isPositiveVerdict(row.priceVerdict as never) ? (row.priceVerdict as 'lowest' | 'good') : null,
    compareChains: (row.comparisonCount ?? 0) + 1,
    isCheapest: Boolean(row.isCheapestInCluster),
    imageUrl: resolveImage(row),
    validFrom: iso(row.validFrom),
    validUntil: iso(row.validUntil),
    datesFromSource: Boolean(row.datesFromSource),
    updatedAt: iso(row.updatedAt ?? row.validFrom),
    sources: rawSources.filter((s) => USER_FACING_SOURCES.has(s)),
    featured: row.isFeatured ? { label: row.featuredLabel ?? 'Χορηγούμενο' } : null,
    essential: row.essential ?? null,
  };
}
