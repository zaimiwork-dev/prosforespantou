// Pure helpers + one batched writer for per-SKU price snapshots and their
// `lastSeenAt` (SRV-02). No prisma import: the caller passes its client, so the
// pure parts are unit-testable and the dotenv-before-prisma rule is untouched.
//
// A PriceSnapshot is written only when a price CHANGES. `lastSeenAt` is the last
// run that still saw that exact price for that SKU, so "the offer ended" can be
// told apart from "the offer is still running, nothing changed".

export const BUMP_CHUNK = 1000;

export const normItemcode = (v) => (v == null || v === '' ? null : String(v));

// WHERE for "the latest snapshot this item should be compared with".
// With an itemcode: that SKU's own history. Without: today's behaviour exactly
// (the whole product at that chain).
export function snapshotLookupWhere(productId, supermarket, chainItemcode, extra = {}) {
  const code = normItemcode(chainItemcode);
  return code
    ? { productId, supermarket, chainItemcode: code, ...extra }
    : { productId, supermarket, ...extra };
}

// Rows are the latest snapshot per (productId, chainItemcode), any order of
// keys. The row an item is compared with:
//  - an itemcode item: its own row; failing that the product's latest row with
//    no itemcode (history written before this column existed - without this
//    fallback every live SKU would write one duplicate snapshot on first run);
//  - an item without itemcode: the product's latest row of any SKU (old rule).
export function latestRowFor(rows, productId, chainItemcode) {
  const code = normItemcode(chainItemcode);
  const mine = rows.filter((r) => r.productId === productId);
  const newest = (list) => list.reduce((a, b) => (!a || +new Date(b.recordedAt ?? 0) > +new Date(a.recordedAt ?? 0) ? b : a), null);
  if (code) {
    const own = mine.find((r) => (r.chainItemcode ?? null) === code);
    if (own) return own;
    return mine.find((r) => (r.chainItemcode ?? null) === null) ?? null;
  }
  return newest(mine);
}

// seen: [{ productId, chainItemcode|null, price, snapshotId? }] - items this run
// saw WITHOUT moving their price. Returns the snapshot ids whose lastSeenAt may
// be bumped: only a snapshot that still carries the seen price (a newer row at
// another price means the seen price is not what that row recorded).
export function pickSnapshotIdsToBump(seen, latestRows) {
  const ids = new Set();
  for (const s of seen) {
    if (s.snapshotId) { ids.add(s.snapshotId); continue; }
    const row = latestRowFor(latestRows, s.productId, s.chainItemcode);
    if (row && row.price === s.price) ids.add(row.id);
  }
  return [...ids];
}

export function chunked(list, size = BUMP_CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Latest snapshot per (productId, chainItemcode) at one chain, batched by
// product. `extraWhere` narrows (the catalogue pass passes kind:'normal').
export async function fetchLatestRows(prisma, supermarket, productIds, retry, label, extraWhere = {}) {
  const rows = [];
  for (const chunk of chunked([...new Set(productIds)])) {
    const got = await retry(label, () =>
      prisma.priceSnapshot.findMany({
        where: { supermarket, productId: { in: chunk }, ...extraWhere },
        orderBy: [{ productId: 'asc' }, { recordedAt: 'desc' }],
        distinct: ['productId', 'chainItemcode'],
        select: { id: true, productId: true, chainItemcode: true, price: true, recordedAt: true },
      }));
    rows.push(...got);
  }
  return rows;
}

// ONE statement per 1,000 ids, never one per item.
export async function bumpLastSeen(prisma, ids, at, retry, label = 'bump lastSeenAt') {
  let n = 0;
  for (const chunk of chunked(ids)) {
    const res = await retry(label, () =>
      prisma.priceSnapshot.updateMany({ where: { id: { in: chunk } }, data: { lastSeenAt: at } }));
    n += res.count;
  }
  return n;
}

// Catalogue pass: wants = [{ productId, chainItemcode|null, price }] against the
// latest 'normal' rows. Changed (or no history) -> a new row carrying the SKU and
// lastSeenAt = recordedAt; unchanged -> reported so the caller can bump it.
export function planNormalSnapshots(wants, latestRows, supermarket, at = new Date()) {
  const toWrite = [];
  const seenUnchanged = [];
  for (const w of wants) {
    const row = latestRowFor(latestRows, w.productId, w.chainItemcode);
    if (row && row.price === w.price) { seenUnchanged.push(w); continue; }
    toWrite.push({
      productId: w.productId,
      supermarket,
      price: w.price,
      isDiscounted: false,
      kind: 'normal',
      chainItemcode: normItemcode(w.chainItemcode),
      recordedAt: at,
      lastSeenAt: at,
    });
  }
  return { toWrite, seenUnchanged };
}
