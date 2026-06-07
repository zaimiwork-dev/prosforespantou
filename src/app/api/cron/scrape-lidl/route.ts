import { NextResponse } from 'next/server';

// Placeholder for the old Lidl OCR cron.
//
// Original wiring used endpoints.leaflets.schwarz/v4/flyers to discover the
// current flyer, then OCR'd each page via Groq vision inline. Two problems:
//   1. The /v4/flyers LIST endpoint went 404 in ~mid-2026, so flyer discovery
//      silently returned null and the route became a no-op (last Leaflet row
//      with content was created 2026-04-20).
//   2. Even when discovery worked, the route's `maxDuration = 300` couldn't
//      cover a 59-page OCR run at ~30 s/page → ~30 min of work.
//
// Replacement (shipped 2026-06-07):
//   - src/scripts/adapters/lidl.mjs — discovers the current flyer by parsing
//     www.lidl-hellas.gr/c/fylladio-lidl/s10020481, fetches pages via the
//     per-flyer endpoint that still works, OCRs each page and hands the
//     result to ingest-offers (source-isolated, MatchCache-aware,
//     PriceSnapshot-tracked).
//   - .github/workflows/scrape-chains.yml runs the adapter weekly on Thu
//     06:00 UTC (no Vercel timeout to worry about), and the daily 04:00 UTC
//     `resolvers` job clears PendingMatch rows via the LLM resolver.
//   - vercel.json's scrape-lidl entry was removed in the same commit so this
//     stub stops being pinged on the old Thu 07:00 UTC schedule.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Lidl cron route deprecated',
      hint: 'Lidl now runs as src/scripts/adapters/lidl.mjs in GitHub Actions (weekly Thu 06:00 UTC).',
    },
    { status: 501 }
  );
}
