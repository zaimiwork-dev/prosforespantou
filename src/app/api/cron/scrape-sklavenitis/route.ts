import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { runSklavenitisAdapter } from '@/scripts/adapters/sklavenitis.mjs';

export const maxDuration = 300;
// Scrapes sklavenitis.gr offers and writes Discounts; always run fresh.
export const dynamic = 'force-dynamic';

// Triggered by Vercel Cron (vercel.json). Sklavenitis moved here from the
// GitHub-Actions scrape because sklavenitis.gr's Akamai now IP-blocks GH
// runners (HTTP 403 on page 1) while serving other origins — same pattern as
// AB. Vercel's egress IPs are a different range; this route exists to run the
// adapter from there.
//
// `?limit=N` caps the scrape (reachability tests + staying inside the 300s
// budget); absent = full run. A capped run trips the ingest "partial scrape"
// guard, so it never deactivates live offers.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : Infinity;

  try {
    const report = await runSklavenitisAdapter({ dryRun: false, limit });
    if (report.healthOk && report.matched > 0) {
      revalidateTag('deals:default', 'max');
    }
    return NextResponse.json({ success: report.healthOk, ...report });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[SKLAVENITIS CRON] Fatal:', error?.message);
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 });
  }
}
