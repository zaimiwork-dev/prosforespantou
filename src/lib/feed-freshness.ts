// Which chains' SHELF prices can be trusted right now.
//
// Shelf (kind='normal') snapshots are written ONLY when a price changes
// (src/scripts/lib/ingest-catalog.mjs), so a stable price has no recent
// snapshot even though it is exactly right. Gating shelf rows on snapshot age
// therefore threw away ~96% of the prices we held (83 of ~14k offers rendered a
// shelf row on 2026-09-15; widening the window alone restored ~2,000).
//
// The honest question is not "how old is the snapshot" but "is the chain's
// catalog feed alive" — a stable price stays true until the scraper says
// otherwise. So: a chain is FRESH when its most recent *representative*
// healthy catalog/baseline run finished within SHELF_FEED_MAX_AGE_DAYS.
// "Representative" reuses the partial-run rule from lib/catalog-run-count.ts:
// a run below half the recent healthy peak (the 29-item Sklavenitis catalog of
// 2026-09-13) does not count as evidence the feed is alive.
//
// Pure function + one loader. Imported by the server action AND the nightly
// recompute script (keep it strip-safe: no enums/decorators).

export const SHELF_FEED_MAX_AGE_DAYS = 10;
// Sources that write kind='normal' snapshots. 'wolt' is deliberately absent:
// the Wolt enrichment runs with WOLT_BASELINE=0 and writes no shelf prices.
export const SHELF_BASELINE_SOURCES: readonly string[] = ['catalog', 'baseline'];
// How far back to look for the healthy peak that defines "representative".
const PEAK_WINDOW_DAYS = 60;

export type FeedRun = {
  chain: string;
  source: string;
  finishedAt: Date | string;
  scrapedItems: number;
  healthOk: boolean;
};

// chain → ISO timestamp of the representative run that makes it fresh.
export type FreshChains = Map<string, string>;

export function freshShelfChains(
  runs: FeedRun[],
  now: Date = new Date(),
  maxAgeDays: number = SHELF_FEED_MAX_AGE_DAYS
): FreshChains {
  const nowMs = now.getTime();
  const peakCutoff = nowMs - PEAK_WINDOW_DAYS * 86400000;
  const freshCutoff = nowMs - maxAgeDays * 86400000;

  const byChain = new Map<string, { at: number; items: number }[]>();
  for (const r of runs) {
    if (!r.healthOk || !SHELF_BASELINE_SOURCES.includes(r.source)) continue;
    const at = new Date(r.finishedAt).getTime();
    if (!Number.isFinite(at) || at < peakCutoff || at > nowMs + 60_000) continue;
    const arr = byChain.get(r.chain) || [];
    arr.push({ at, items: r.scrapedItems });
    byChain.set(r.chain, arr);
  }

  const out: FreshChains = new Map();
  for (const [chain, list] of byChain) {
    list.sort((a, b) => b.at - a.at); // newest first
    const peak = Math.max(...list.map((x) => x.items));
    const floor = peak > 20 ? peak * 0.5 : 1;
    const rep = list.find((x) => x.items >= floor);
    if (rep && rep.at >= freshCutoff) out.set(chain, new Date(rep.at).toISOString());
  }
  return out;
}

// Minimal structural type so both the Prisma client (server action) and the
// dynamically imported client in .mjs scripts satisfy it. The arg is `any`
// on purpose: Prisma's generic findMany signature is not assignable to a
// narrower structural one, and the query below is fixed anyway.
type IngestRunReader = {
  ingestRun: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<FeedRun[]>;
  };
};

export async function loadFreshShelfChains(
  prisma: IngestRunReader,
  now: Date = new Date()
): Promise<FreshChains> {
  const runs = await prisma.ingestRun.findMany({
    where: {
      source: { in: [...SHELF_BASELINE_SOURCES] },
      healthOk: true,
      finishedAt: { gte: new Date(now.getTime() - PEAK_WINDOW_DAYS * 86400000) },
    },
    select: { chain: true, source: true, finishedAt: true, scrapedItems: true, healthOk: true },
  });
  return freshShelfChains(runs, now);
}
