import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
// @ts-expect-error — .mjs adapter has no .d.ts; runtime resolution works.
import { runMasoutisAdapter } from '@/scripts/adapters/masoutis.mjs';

export const maxDuration = 300;
// The adapter fetches Masoutis pages and writes Discounts; force a fresh run on every fire.
export const dynamic = 'force-dynamic';

// Triggered by Vercel Cron (vercel.json). Daily refresh of web offers; weekly
// for leaflet via ?source=leaflet schedule. Returns the ingest report so
// monitoring dashboards can read it.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') === 'leaflet' ? 'leaflet' : 'web';

  try {
    const report = await runMasoutisAdapter({ source, dryRun: false });
    if (report.healthOk && report.matched > 0) {
      revalidateTag('deals:default', 'max');
    }
    return NextResponse.json({ success: report.healthOk, ...report });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[MASOUTIS CRON] Fatal:', error?.message);
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 });
  }
}
