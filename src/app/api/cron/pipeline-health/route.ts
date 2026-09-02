import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import prisma from '@/lib/prisma';
import { fetchFeedHealth, feedAlarms } from '@/lib/pipeline-health';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Daily pipeline watchdog (GitHub Actions, 08:00 UTC — after every scrape
// window). Checks each expected feed's last IngestRun and reports feeds that
// stopped running or came back suspiciously small.
//
// RESPONDS 503 WHEN SOMETHING IS WRONG. This is load-bearing: the CI job pings
// this route with `curl -fsS`, which fails only on an HTTP error status. The
// route used to answer 200 with `{ok:false}`, so curl succeeded, the workflow
// stayed green, and the only alarm was a Sentry message nobody reads — which is
// how AB sat dead for five weeks (2026-08-02 → 09-02) with a "passing"
// watchdog every single day. A red workflow run emails the owner for free.
type FeedRow = Awaited<ReturnType<typeof fetchFeedHealth>>[number];

const summarise = (f: FeedRow) => ({
  chain: f.spec.chain,
  source: f.spec.source,
  status: f.status,
  volumeStatus: f.volumeStatus,
  lastOkItems: f.lastOkItems,
  referenceItems: f.referenceItems,
  lastOkAt: f.lastOkAt,
  lastRunAt: f.lastRun?.finishedAt ?? null,
  schedule: f.spec.schedule,
});

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const feeds = await fetchFeedHealth(prisma);
    const alarms = feeds.filter(feedAlarms);

    if (alarms.length > 0) {
      const detail = alarms
        .map((f) => {
          if (f.volumeStatus === 'collapsed' && !['stale', 'never'].includes(f.status)) {
            return `${f.spec.chain}/${f.spec.source} RAN BUT CAME BACK SMALL `
              + `(${f.lastOkItems} items vs ~${f.referenceItems} typical)`;
          }
          const lastOk = f.lastOkAt ? `last ok ${f.lastOkAt.toISOString().slice(0, 16)}Z` : 'no healthy run ever';
          return `${f.spec.chain}/${f.spec.source} is ${f.status.toUpperCase()} (${lastOk}; expected ${f.spec.schedule})`;
        })
        .join(' | ');
      Sentry.captureMessage(`Pipeline health: ${alarms.length} feed(s) down — ${detail}`, 'error');
      // Body first, status second — the CI job needs the detail in its log.
      return NextResponse.json(
        {
          ok: false,
          checkedAt: new Date().toISOString(),
          alarms: alarms.map((f) => `${f.spec.chain}/${f.spec.source}`),
          detail,
          feeds: feeds.map(summarise),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      feeds: feeds.map(summarise),
    });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[PIPELINE-HEALTH CRON] Fatal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
