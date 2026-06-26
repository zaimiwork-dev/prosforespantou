// Pipeline observability: which scrape feeds are expected to run, how often,
// and whether they're healthy. Pure logic — DB access lives in the callers
// (the admin Υγεία tab action + /api/cron/pipeline-health).
//
// A feed is one (chain, source) pair with its own cadence. `maxAgeHours` is
// the alarm threshold: cadence plus slack — daily feeds get 36h, weekly feeds
// 8 days — so one delayed run doesn't alert but a genuinely dead feed does.

export type FeedSpec = {
  chain: string;
  source: 'web' | 'leaflet';
  maxAgeHours: number;
  schedule: string; // human-readable — where/when this runs
};

// Keep in sync with .github/workflows/scrape-chains.yml and vercel.json.
export const EXPECTED_FEEDS: FeedSpec[] = [
  { chain: 'mymarket', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 00:00 UTC — GitHub Actions' },
  { chain: 'sklavenitis', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 01:00 UTC — GitHub Actions' },
  { chain: 'kritikos', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 02:00 UTC — GitHub Actions' },
  { chain: 'bazaar', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 02:30 UTC — GitHub Actions' },
  { chain: 'ab', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 03:00 UTC — GitHub Actions' },
  { chain: 'masoutis', source: 'web', maxAgeHours: 36, schedule: 'καθημερινά 06:00 UTC — Vercel cron' },
  { chain: 'masoutis', source: 'leaflet', maxAgeHours: 8 * 24, schedule: 'κάθε Πέμπτη 06:30 UTC — Vercel cron' },
  { chain: 'lidl', source: 'leaflet', maxAgeHours: 8 * 24, schedule: 'κάθε Πέμπτη 06:00 UTC — GitHub Actions' },
];

// 'ok'    — fresh healthy run, all good
// 'warn'  — a healthy run exists within the window, but the most recent run
//           tripped a safety check (zero items / suspicious count / errors)
// 'stale' — no healthy run within maxAgeHours; the feed is effectively dead
// 'never' — no run recorded at all (feed never ran since observability shipped)
export type FeedStatus = 'ok' | 'warn' | 'stale' | 'never';

export function evaluateFeed(
  spec: FeedSpec,
  lastRun: { finishedAt: Date; healthOk: boolean } | null,
  lastOkRun: { finishedAt: Date } | null,
  now: Date = new Date()
): FeedStatus {
  if (!lastRun) return 'never';
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
};

// Shared by the cron alert route and the admin Υγεία action. Takes the prisma
// client as a parameter so this module stays import-safe for unit tests.
export async function fetchFeedHealth(
  prisma: { ingestRun: { findFirst: (args: object) => Promise<IngestRunRow | null> } },
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
      return {
        spec,
        status: evaluateFeed(spec, lastRun, lastOk, now),
        lastRun,
        lastOkAt: lastOk?.finishedAt ?? null,
      };
    })
  );
}
