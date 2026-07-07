// Category round-robin for default deal listings. The hotScore ranking is
// honest but category-blind: when one department dominates the top scores
// (live 2026-07-07: 9 of the first 12 cards on /deals were pet food), the
// page reads as a niche shop. Interleaving keeps each category's internal
// rank order but rotates across categories, so the first screenful spans the
// store. Only applied to the DEFAULT unfiltered view — explicit sorts and
// category filters are left exactly as the user asked.
export function interleaveByCategory(deals) {
  if (!Array.isArray(deals) || deals.length < 3) return deals;
  const buckets = new Map();
  for (const d of deals) {
    const key = d.category || 'Άλλο';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(d);
  }
  if (buckets.size < 2) return deals;
  // First-appearance order = each category enters at its best card's rank.
  const order = [...buckets.keys()];
  const out = [];
  let drained = false;
  while (!drained) {
    drained = true;
    for (const key of order) {
      const bucket = buckets.get(key);
      if (bucket.length > 0) {
        out.push(bucket.shift());
        drained = false;
      }
    }
  }
  return out;
}
