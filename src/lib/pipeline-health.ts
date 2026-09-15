// Pipeline observability: which scrape feeds are expected to run, how often,
// and whether they're healthy. Pure logic — DB access lives in the callers
// (the admin Υγεία tab action + /api/cron/pipeline-health).
//
// A feed is one (chain, source) pair with its own cadence. `maxAgeHours` is
// the alarm threshold: cadence plus slack — daily feeds get 36h, weekly feeds
// 8 days — so one delayed run doesn't alert but a genuinely dead feed does.

// 'web' | 'leaflet' are the OFFER feeds. The rest write no Discount rows but
// are just as load-bearing: 'catalog' is a chain's own full-catalog walk (it
// grows the Product catalog and writes the kind='normal' shelf prices the
// «κανονικά ~Y€» comparison depends on), 'baseline' is the shelf-price series a
// chain's offers run produces for free (kritikos BASELINE=1), and 'wolt' is the
// supplemental Wolt GTIN enrichment. None of them were watched until
// 2026-09-15, which is how a 29-item Sklavenitis catalog run on 09-13 was
// recorded health_ok=true and nobody heard about it.
export type FeedSpec = {
  chain: string;
  source: 'web' | 'leaflet' | 'catalog' | 'baseline' | 'wolt';
  maxAgeHours: number;
  schedule: string; // human-readable — where/when this runs
  // A feed added to this list BEFORE its first scheduled run would read
  // 'never' and page the owner every morning until that run happens (five
  // feeds, five red mornings when the catalog rows landed on a Tuesday).
  // Until this ISO date a missing first run is 'pending' — visible, not
  // alarming. After it, 'never' means what it says. Remove once the feed has
  // reported.
  graceUntil?: string;
};

// Weekly feeds get 9 days: cadence (7d) plus slack, so one skipped Sunday
// warns rather than pages, and two consecutive misses alarm.
const WEEKLY = 9 * 24;

// Keep in sync with .github/workflows/scrape-chains.yml and vercel.json.
export const EXPECTED_FEEDS: FeedSpec[] = [
  { chain: 'mymarket', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 00:00 UTC — GitHub Actions' },
  // Sklavenitis runs from the dev PC (Akamai 403s GitHub/Vercel IPs; owner chose
  // the free local path over a paid proxy, 2026-07-06). 48h window tolerates one
  // missed night (PC off) without a false alarm; two misses = real 'stale'.
  { chain: 'sklavenitis', source: 'web', maxAgeHours: 48, schedule: 'καθημερινά 02:30 τοπική ώρα — Windows task (dev PC)' },
  { chain: 'kritikos', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 02:00 UTC — GitHub Actions' },
  { chain: 'bazaar', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 02:30 UTC — GitHub Actions' },
  { chain: 'ab', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 03:00 UTC — GitHub Actions' },
  { chain: 'masoutis', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 03:30 UTC — GitHub Actions' },
  { chain: 'masoutis', source: 'leaflet', maxAgeHours: 8 * 24, schedule: 'κάθε Πέμπτη 03:00 UTC — GitHub Actions' },
  { chain: 'lidl', source: 'leaflet', maxAgeHours: 8 * 24, schedule: 'κάθε Πέμπτη 06:00 UTC — GitHub Actions' },

  // ── Shelf-price / catalog feeds ───────────────────────────────────────────
  // Kritikos already walks its whole catalog to find offers, so its shelf-price
  // series rides along with the nightly offers run (BASELINE=1) instead of a
  // separate Sunday job. 48h = one missed night tolerated, same as sklavenitis.
  { chain: 'kritikos', source: 'baseline', maxAgeHours: 48, schedule: 'καθημερινά 02:00 UTC — GitHub Actions (kritikos-offers BASELINE=1)' },
  // NOTE: kritikos/catalog stays 'never' until the canonical scraper is routed
  // through ingestCatalog (shipped alongside this row) and the next Sunday run
  // records its first IngestRun. That is intended — the feed genuinely had no
  // flight recorder before, and a 'never' is the honest reading of that.
  { chain: 'kritikos', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 06:00 UTC — GitHub Actions (kritikos-canonical)', graceUntil: '2026-09-22' },
  { chain: 'lidl', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 03:30 UTC — GitHub Actions (lidl-catalog)' },
  { chain: 'ab', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 04:30 UTC — GitHub Actions (ab-catalog)' },
  { chain: 'masoutis', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 06:30 UTC — GitHub Actions (masoutis-catalog)' },
  { chain: 'bazaar', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 07:30 UTC — GitHub Actions (bazaar-catalog)' },
  // My Market's catalog is a continue-on-error STEP inside the mymarket-canonical
  // job, not a job of its own — so it can fail silently while the job stays
  // green. This row is the only place that failure becomes visible.
  { chain: 'mymarket', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 05:30 UTC — GitHub Actions (βήμα continue-on-error μέσα στο mymarket-canonical)' },
  // Sklavenitis' CI catalog job is a permanent no-op without PROXY_URL; the run
  // that actually happens is the owner's Windows scheduled task.
  { chain: 'sklavenitis', source: 'catalog', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 04:00 τοπική ώρα — Windows task (dev PC)' },

  // ── Wolt GTIN enrichment (supplemental canonical catalog) ─────────────────
  { chain: 'sklavenitis', source: 'wolt', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 05:00 UTC — GitHub Actions (sklavenitis-canonical)', graceUntil: '2026-09-22' },
  { chain: 'mymarket', source: 'wolt', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 05:30 UTC — GitHub Actions (mymarket-canonical)', graceUntil: '2026-09-22' },
  { chain: 'masoutis', source: 'wolt', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 08:30 UTC — GitHub Actions (masoutis-canonical)', graceUntil: '2026-09-22' },
  { chain: 'ab', source: 'wolt', maxAgeHours: WEEKLY, schedule: 'κάθε Κυριακή 09:00 UTC — GitHub Actions (ab-canonical)', graceUntil: '2026-09-22' },
];

// 'ok'    — fresh healthy run, all good
// 'warn'  — a healthy run exists within the window, but the most recent run
//           tripped a safety check (zero items / suspicious count / errors)
// 'stale' — no healthy run within maxAgeHours; the feed is effectively dead
// 'never' — no run recorded at all (feed never ran since observability shipped)
// 'pending' — no run yet, but the feed's first scheduled run is still ahead
//           (FeedSpec.graceUntil); shown, never alarmed
export type FeedStatus = 'ok' | 'warn' | 'stale' | 'never' | 'pending';

export function evaluateFeed(
  spec: FeedSpec,
  lastRun: { finishedAt: Date; healthOk: boolean } | null,
  lastOkRun: { finishedAt: Date } | null,
  now: Date = new Date()
): FeedStatus {
  if (!lastRun) {
    if (spec.graceUntil && now.getTime() < new Date(spec.graceUntil).getTime()) return 'pending';
    return 'never';
  }
  const maxAgeMs = spec.maxAgeHours * 3600_000;
  const okFresh = lastOkRun !== null && now.getTime() - lastOkRun.finishedAt.getTime() <= maxAgeMs;
  if (!okFresh) return 'stale';
  return lastRun.healthOk ? 'ok' : 'warn';
}

// 'warn' deliberately does NOT alarm: the safety rails already kept last-good
// data live, and a one-off partial scrape self-heals on the next run. It only
// escalates to 'stale' (and alarms) if the feed stays unhealthy past the window.
export function isAlarming(status: FeedStatus): boolean {
  return status === 'stale' || status === 'never';
}

// ── Volume ──────────────────────────────────────────────────────────────────
// Freshness answers "did the feed run?". It cannot answer "did the run bring
// back the right amount?". A run that succeeds while returning a fraction of
// the usual items is healthOk, recent, and wrong.
//
// This compares the newest healthy run's item count against the MEDIAN of the
// healthy runs before it — run-to-run, same metric, so it is unaffected by
// offers expiring between runs. (Comparing against the count of currently
// active offers would flag every weekly leaflet in the window between its
// offers expiring and the next scrape, which is normal and would train us to
// ignore the alarm.) Median, not max, so one unusually big week doesn't make
// every ordinary week look like a collapse.
export type VolumeStatus = 'ok' | 'collapsed' | 'unknown';

export const VOLUME_COLLAPSE_RATIO = 0.5;
// Below this, normal week-to-week wobble swamps the signal.
export const VOLUME_MIN_REFERENCE = 20;
// Fewer prior runs than this and the median means little.
export const VOLUME_MIN_SAMPLES = 3;
// The INGEST-TIME catalog guard (ingest-catalog.mjs) judges a single run it is
// about to write, not a feed's steady state, so one prior full-size run is
// already enough to know a 29-item walk is truncated. The watchdog keeps the
// stricter 3 — it must not cry wolf on a feed that has barely any history.
export const CATALOG_VOLUME_MIN_SAMPLES = 1;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function evaluateVolume(
  latest: number | null,
  priorSamples: number[],
  minSamples: number = VOLUME_MIN_SAMPLES
): VolumeStatus {
  if (latest == null || priorSamples.length < minSamples) return 'unknown';
  const reference = median(priorSamples);
  if (reference == null || reference < VOLUME_MIN_REFERENCE) return 'unknown';
  return latest < reference * VOLUME_COLLAPSE_RATIO ? 'collapsed' : 'ok';
}

// A feed is worth waking someone for if it stopped running OR its last run came
// back suspiciously small. 'unknown' never alarms — too little history to judge.
export function feedAlarms(feed: { status: FeedStatus; volumeStatus?: VolumeStatus }): boolean {
  return isAlarming(feed.status) || feed.volumeStatus === 'collapsed';
}

export type IngestRunRow = {
  id: string;
  chain: string;
  source: string;
  startedAt: Date;
  finishedAt: Date;
  scrapedItems: number;
  matched: number;
  reviewQueued: number;
  priceChanges: number;
  deactivated: number;
  errors: number;
  healthOk: boolean;
  warnings: string[];
};

export type FeedHealth = {
  spec: FeedSpec;
  status: FeedStatus;
  lastRun: IngestRunRow | null;
  lastOkAt: Date | null;
  // Volume signal (see evaluateVolume). `reference` is the median item count of
  // the healthy runs preceding the latest one, kept so the alarm can say what
  // it compared against instead of just asserting a collapse.
  volumeStatus: VolumeStatus;
  lastOkItems: number | null;
  referenceItems: number | null;
};

// How many recent healthy runs to consider when judging volume. Enough to
// cover several cycles of a weekly feed without reaching back to a different
// season's assortment.
export const VOLUME_HISTORY = 8;

// Shared by the cron alert route and the admin Υγεία action. Takes the prisma
// client as a parameter so this module stays import-safe for unit tests.
export async function fetchFeedHealth(
  prisma: {
    ingestRun: {
      findFirst: (args: object) => Promise<IngestRunRow | null>;
      findMany?: (args: object) => Promise<IngestRunRow[]>;
    };
  },
  now: Date = new Date()
): Promise<FeedHealth[]> {
  return Promise.all(
    EXPECTED_FEEDS.map(async (spec) => {
      const where = { chain: spec.chain, source: spec.source };
      const lastRun = await prisma.ingestRun.findFirst({
        where,
        orderBy: { finishedAt: 'desc' },
      });
      const lastOk = lastRun?.healthOk
        ? lastRun
        : await prisma.ingestRun.findFirst({
            where: { ...where, healthOk: true },
            orderBy: { finishedAt: 'desc' },
          });

      // Recent healthy runs, newest first: [latest, ...priors]. findMany is
      // optional so existing callers passing a narrow stub still work — they
      // simply get volumeStatus 'unknown' rather than a crash.
      let lastOkItems: number | null = null;
      let referenceItems: number | null = null;
      let volumeStatus: VolumeStatus = 'unknown';
      if (prisma.ingestRun.findMany) {
        const healthy = await prisma.ingestRun.findMany({
          where: { ...where, healthOk: true },
          orderBy: { finishedAt: 'desc' },
          take: VOLUME_HISTORY,
        });
        const counts = healthy.map((r) => r.scrapedItems);
        lastOkItems = counts[0] ?? null;
        const priors = counts.slice(1);
        referenceItems = median(priors);
        volumeStatus = evaluateVolume(lastOkItems, priors);
      }

      return {
        spec,
        status: evaluateFeed(spec, lastRun, lastOk, now),
        lastRun,
        lastOkAt: lastOk?.finishedAt ?? null,
        volumeStatus,
        lastOkItems,
        referenceItems,
      };
    })
  );
}
