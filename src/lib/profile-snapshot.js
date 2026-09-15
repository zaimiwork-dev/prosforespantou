// What a device's server-side profile holds (W4a, 2026-09-16): a small,
// bounded copy of the preferences the shopper created on this device —
// declared stores/departments, favorites, shopping-list lines, learned
// interest weights and the text size. Pure (no browser APIs), so the sync
// client and the tests share it; the server validates the same limits with
// lib/validations/profile.ts.
//
// Deliberately minimal: list lines keep ids + quantity, never whole offer
// objects (names/prices change daily and are re-read from the DB anyway).

export const PROFILE_LIMITS = {
  stores: 20,
  categories: 20,
  favorites: 200,
  listItems: 100,
  interestKeys: 60,
  shortText: 64,
  name: 200,
  key: 300,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidOrNull = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function uniqueStrings(list, cap, max) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const t = text(v, max);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

function topWeights(map, cap) {
  const entries = Object.entries(map && typeof map === 'object' ? map : {})
    .filter(([k, v]) => k && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, cap);
  return Object.fromEntries(entries.map(([k, v]) => [k.slice(0, PROFILE_LIMITS.shortText), Math.round(v * 1000) / 1000]));
}

export function buildProfileSnapshot(state = {}, interests = {}, textSize = 'normal') {
  const L = PROFILE_LIMITS;
  const favorites = [];
  for (const f of Array.isArray(state.favorites) ? state.favorites : []) {
    const key = text(f?.key, L.key);
    if (!key) continue;
    favorites.push({
      key,
      productId: uuidOrNull(f.productId),
      productName: text(f.productName, L.name) || '',
      supermarket: text(f.supermarket, L.shortText),
    });
    if (favorites.length >= L.favorites) break;
  }

  const listItems = [];
  for (const i of Array.isArray(state.items) ? state.items : []) {
    const discountId = uuidOrNull(i?.id);
    if (!discountId) continue;
    const q = Math.round(Number(i.quantity) || 1);
    listItems.push({
      discountId,
      productId: uuidOrNull(i.productId ?? i.product_id),
      supermarket: text(i.supermarket ?? i.supermarket_id, L.shortText),
      quantity: Math.min(99, Math.max(1, q)),
    });
    if (listItems.length >= L.listItems) break;
  }

  return {
    preferredStores: uniqueStrings(state.preferredStores, L.stores, L.shortText),
    preferredCategories: uniqueStrings(state.preferredCategories, L.categories, L.shortText),
    favorites,
    listItems,
    interests: {
      updatedAt: Number.isFinite(interests?.updatedAt) ? interests.updatedAt : 0,
      categories: topWeights(interests?.categories, L.interestKeys),
      brands: topWeights(interests?.brands, L.interestKeys),
    },
    textSize: textSize === 'large' ? 'large' : 'normal',
  };
}

// Stable fingerprint so an unchanged profile is not re-sent. The interest
// clock (updatedAt) is left out: decay ticks it without a real change.
export function snapshotFingerprint(snapshot) {
  const { interests, ...rest } = snapshot || {};
  const json = JSON.stringify({ ...rest, categories: interests?.categories, brands: interests?.brands });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return `${json.length}:${(h >>> 0).toString(36)}`;
}
