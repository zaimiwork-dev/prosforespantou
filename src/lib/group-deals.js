// One Product can have multiple active Discount rows — one per source
// ('web' | 'leaflet' | 'manual') as decided in PHASES.md Phase 4. The public
// site groups them into a single card so users don't see duplicates, and the
// card surfaces both source tags ("εβδομαδιαία" / "φυλλάδιο").
//
// Picks the lowest discountedPrice as the primary row, ties broken by
// preferring the row that has a strikethrough originalPrice (more honest %).

export function groupDealsByProduct(deals) {
  if (!Array.isArray(deals) || deals.length === 0) return [];

  const groups = new Map();
  for (const d of deals) {
    // Rows without a productId stay isolated — keyed by their own id.
    const key = d.productId ?? d.product_id ?? `__nopid_${d.id}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...d, sources: d.source ? [d.source] : [] });
      continue;
    }

    if (d.source && !existing.sources.includes(d.source)) {
      existing.sources.push(d.source);
    }

    const existingPrice = existing.discountedPrice ?? existing.discounted_price ?? Infinity;
    const newPrice = d.discountedPrice ?? d.discounted_price ?? Infinity;
    
    const existingUntil = existing.validUntil ? new Date(existing.validUntil).getTime() : 0;
    const newUntil = d.validUntil ? new Date(d.validUntil).getTime() : 0;

    const newIsBetter =
      newPrice < existingPrice ||
      (newPrice === existingPrice && !existing.originalPrice && d.originalPrice) ||
      (newPrice === existingPrice && !!existing.originalPrice === !!d.originalPrice && newUntil > existingUntil);

    if (newIsBetter) {
      const sources = existing.sources;
      // Inherit originalPrice if the new better row doesn't have it but the old one did
      if (!d.originalPrice && existing.originalPrice) {
        d.originalPrice = existing.originalPrice;
        if (existing.original_price) d.original_price = existing.original_price;
      }
      groups.set(key, { ...d, sources });
    } else if (newPrice === existingPrice) {
      // Prices are equal. Merge beneficial fields into existing.
      if (newUntil > existingUntil) {
        existing.validUntil = d.validUntil;
        if (d.valid_until) existing.valid_until = d.valid_until;
      }
      // If the new row has an original price and the existing doesn't, inherit it.
      if (!existing.originalPrice && d.originalPrice) {
        existing.originalPrice = d.originalPrice;
        if (d.original_price) existing.original_price = d.original_price;
      }
    }
  }

  return Array.from(groups.values());
}
