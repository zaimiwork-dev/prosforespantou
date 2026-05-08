import { NextResponse } from 'next/server';

// Placeholder for the Wolt sync cron.
//
// Original wiring POSTed the fetched JSON to /api/admin/import-wolt, but that
// route was never built — the cron 500'd on every fire. Removed from
// vercel.json on 2026-05-01 so it stops paging.
//
// To re-enable: extract the upsert logic from src/scripts/scrape-wolt.mjs into
// a shared lib (e.g. src/lib/wolt-import.ts), call it directly here (no
// internal fetch, no second auth hop), and re-add the cron entries to
// vercel.json with real `url` query params.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Wolt sync cron not implemented',
      hint: 'See PHASES.md Phase 4 — extract scrape-wolt.mjs into src/lib/wolt-import.ts and wire here.',
    },
    { status: 501 }
  );
}
