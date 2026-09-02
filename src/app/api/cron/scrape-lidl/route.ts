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
//   - src/scripts/adapters/lidl.mjs — reads the weekly offers as STRUCTURED
//     data from lidl-hellas.gr's e-shop search API and hands them to
//     ingest-offers (source-isolated, MatchCache-aware, PriceSnapshot-tracked).
//     OCR was dropped entirely on 2026-06-15: it garbled ~15% of Greek names,
//     and the same offers are available as clean JSON. No Groq call remains in
//     the Lidl path — do not reintroduce a vision model here.
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
