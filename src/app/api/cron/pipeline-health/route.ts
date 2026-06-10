import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import prisma from '@/lib/prisma';
import { fetchFeedHealth, isAlarming } from '@/lib/pipeline-health';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Daily staleness alarm (vercel.json, 08:00 UTC — after every scrape window).
// Checks each expected feed's last IngestRun and raises a Sentry error when a
// feed is dead, so a silently broken adapter surfaces within a day instead of
// whenever someone notices stale prices.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const feeds = await fetchFeedHealth(prisma);
    const alarms = feeds.filter((f) => isAlarming(f.status));

    if (alarms.length > 0) {
      const detail = alarms
        .map((f) => {
          const lastOk = f.lastOkAt ? `last ok ${f.lastOkAt.toISOString().slice(0, 16)}Z` : 'no healthy run ever';
          return `${f.spec.chain}/${f.spec.source} is ${f.status.toUpperCase()} (${lastOk}; expected ${f.spec.schedule})`;
        })
        .join(' | ');
      Sentry.captureMessage(`Pipeline health: ${alarms.length} feed(s) down — ${detail}`, 'error');
    }

    return NextResponse.json({
      ok: alarms.length === 0,
      checkedAt: new Date().toISOString(),
      feeds: feeds.map((f) => ({
        chain: f.spec.chain,
        source: f.spec.source,
        status: f.status,
        lastOkAt: f.lastOkAt,
        lastRunAt: f.lastRun?.finishedAt ?? null,
        schedule: f.spec.schedule,
      })),
    });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[PIPELINE-HEALTH CRON] Fatal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
