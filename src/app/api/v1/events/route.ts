// POST /api/v1/events — usage events from the app, one per call, same fields
// as the website's trackEvent (src/actions/track-event.ts), which does the
// validation, rate limit, dedupe and the deal_click popularity bump. The app
// only sends after the user accepted «στατιστικά χρήσης» (mobile/src/lib/analytics.ts).
//
// ClickEvent has no platform column, so app events are told apart from web
// ones by an `app/` prefix on `page` — per-page stats then never mix a phone
// screen with the web page of the same name.
import { NextResponse } from 'next/server';
import { trackEvent } from '@/actions/track-event';
import { fail } from '@/lib/api/respond';

// The browser preview of the app (expo start --web) sends JSON, which needs a
// CORS preflight; phones ignore CORS.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid event');

  const raw = body as Record<string, unknown>;
  const page = typeof raw.page === 'string' && raw.page ? `app/${raw.page}` : 'app';
  const result = await trackEvent({ ...raw, page: page.slice(0, 64) });

  if ('rateLimited' in result && result.rateLimited) return fail(429, 'too many events');
  if (!result.success) return fail(400, 'invalid event');
  return NextResponse.json({ ok: true }, { status: 202, headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
