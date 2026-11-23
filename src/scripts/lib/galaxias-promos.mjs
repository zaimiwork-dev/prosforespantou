// Γαλαξίας (galaxias.shop, Magento 2) promotions → what a shopper sees.
// Owner 2026-11-23: «we need offers from galaksias». Pure; used by
// adapters/galaxias.mjs (offers) and galaxias-catalog.mjs (regular prices).
//
// Magento's own price_range never includes these promotions: the shop's
// frontend computes them from each product's `catalog_rules` (function Y in
// galaxias.shop's main bundle, read 2026-11-23). This file ports that logic so
// we show exactly what their site shows:
//   - a rule whose name contains «ΔΩΡΟΕΠΙΤΑΓΗ»          → gift voucher (skipped)
//   - promoType 'bravo_bonus' / 'extra_bonus' / yield_points → loyalty points (skipped for now)
//   - action cheapest|expensive|free_offer, qty > 1, or an «N+M» tag
//                                                       → «offer»: a label, the price does not change
//   - action percent|fixed|final_price                  → «unit discount»: changes the price
// «is_silent» only means the e-shop draws no badge. Read 2026-11-23: almost
// every silent rule carries a CAMPAIGN tag — «ΦΥΛΛΑΔΙΟ» (the leaflet, 939
// rules), «ΣΥΜΦΕΡΕΙ» (1,059), «ΤΗΛΕΟΠΤΙΚΟ» (TV, 88) — and these are the offers
// the shop advertises; card-points tags (EXTRA_BONUS / BRAVO_BONUS) are not
// price offers. So a rule is ADVERTISED when it is not silent or carries a
// campaign tag; points are left for the labelled points work.
// A rule counts only on the days it runs (from/to) and only when it holds in
// every store («All Stores») — a one-store promo is not a chain offer.

const GIFT_VOUCHER = 'ΔΩΡΟΕΠΙΤΑΓΗ';
const UNIT_ACTIONS = new Set(['percent', 'fixed', 'final_price']);
const OFFER_ACTIONS = new Set(['cheapest', 'expensive', 'free_offer']);
const N_PLUS_M = /^\s*(\d+)\s*\+\s*(\d+)/;
const CAMPAIGNS = ['ΦΥΛΛΑΔΙΟ', 'ΣΥΜΦΕΡΕΙ', 'ΤΗΛΕΟΠΤΙΚΟ'];
const POINTS_TAGS = ['EXTRA_BONUS', 'BRAVO_BONUS'];

const tagsOf = (rule) => (rule.tags ?? []).map((t) => String(t).trim().toUpperCase());
/** An offer the shop advertises: badged on its site, or part of a campaign. */
export function advertised(rule) {
  const tags = tagsOf(rule);
  if (tags.some((t) => POINTS_TAGS.includes(t))) return false;
  return !rule.is_silent || tags.some((t) => CAMPAIGNS.includes(t));
}
/** In the printed leaflet («ΦΥΛΛΑΔΙΟ») — filed under the chain's leaflet feed. */
export const inLeaflet = (rule) => tagsOf(rule).includes('ΦΥΛΛΑΔΙΟ');

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function ruleKind(rule) {
  const action = rule.action_name ?? '';
  if ((rule.name ?? '').includes(GIFT_VOUCHER)) return 'giftVoucher';
  if (rule.promoType === 'bravo_bonus') return 'bravoBonus';
  if (action === 'yield_points' || rule.promoType === 'extra_bonus') return 'extraBonus';
  if (OFFER_ACTIONS.has(action) || num(rule.qty) > 1 || (rule.tags ?? []).some((t) => N_PLUS_M.test(t))) return 'offer';
  if (UNIT_ACTIONS.has(action)) return 'unitDiscount';
  return 'other';
}

// Galaxias dates are «2026-11-11» or «2026-11-24 23:59:59», Greek local time.
function day(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function ruleActive(rule, today) {
  const from = day(rule.from);
  const to = day(rule.to);
  if (from && today < from) return false;
  if (to && today > to) return false;
  const stores = rule.stores;
  const all = Array.isArray(stores) ? stores.some((x) => /all stores/i.test(String(x))) : /all stores/i.test(String(stores ?? 'All Stores'));
  return all;
}

// The price after unit discounts, exactly as their frontend rounds it.
function applyUnit(price, rule) {
  const v = num(rule.actions?.amount);
  if (!(v > 0)) return price;
  switch (rule.action_name) {
    case 'final_price': return v;
    case 'percent': return Math.floor(100 * (price - price * (v / 100)) + 1e-8) / 100;
    case 'fixed': return Math.max(0, Math.round(100 * (price - v)) / 100);
    default: return price;
  }
}

const fmtAmount = (rule) => {
  const v = num(rule.actions?.amount);
  return rule.action_name === 'percent' ? `-${v}%` : `-${String(v.toFixed(2)).replace('.', ',')}€`;
};

// The sticker of an «offer» rule, in the shop's own words where it has them.
function offerLabel(rule) {
  for (const tag of rule.tags ?? []) {
    const m = String(tag).match(N_PLUS_M);
    if (m) return `${m[1]}+${m[2]} Δώρο`;
  }
  const name = String(rule.name ?? '').trim();
  const nm = name.match(N_PLUS_M);
  if (nm) return `${nm[1]}+${nm[2]} Δώρο`;
  const qty = num(rule.qty);
  if (qty > 1 && (rule.action_name === 'percent' || rule.action_name === 'fixed') && num(rule.actions?.amount) > 0) {
    return `${fmtAmount(rule)} με αγορά ${qty} τεμ.`;
  }
  return name || null;
}

/**
 * One product → its regular price and its advertised offer today (if any).
 * regular: Magento's price; rules: catalog_rules; today: 'YYYY-MM-DD' (Athens).
 * Returns { shelf, offer } where shelf = the regular price (Magento's — the
 * promotions are never part of it) and offer = { price, originalPrice, label,
 * kind: 'discount'|'multibuy', leaflet, validFrom, validUntil } or null.
 */
export function galaxiasPrice(regular, rules, today) {
  const reg = num(regular);
  const active = (rules ?? []).filter((r) => ruleActive(r, today) && advertised(r));
  let final = reg;
  const cuts = [];
  const offers = [];
  for (const r of active) {
    const k = ruleKind(r);
    if (k === 'unitDiscount') {
      const before = final;
      final = applyUnit(final, r);
      if (final < before) cuts.push(r);
    } else if (k === 'offer') {
      offers.push(r);
    }
  }
  const meta = (rs) => ({
    leaflet: rs.some(inLeaflet),
    validFrom: rs.map((r) => day(r.from)).filter(Boolean).sort().at(-1) ?? null,
    validUntil: rs.map((r) => day(r.to)).filter(Boolean).sort()[0] ?? null,
  });
  if (cuts.length > 0 && final < reg) {
    return { shelf: reg, offer: { price: final, originalPrice: reg, label: null, kind: 'discount', ...meta(cuts) } };
  }
  if (offers.length > 0) {
    // «1+1», «-10% με αγορά 2 τεμ.»: the price of ONE item, the deal as the sticker.
    return { shelf: reg, offer: { price: reg, originalPrice: null, label: offerLabel(offers[0]), kind: 'multibuy', ...meta(offers) } };
  }
  return { shelf: reg, offer: null };
}
