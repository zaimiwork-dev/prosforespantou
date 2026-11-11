// POST /api/v1/impressions — offers a shopper actually SAW in the app (a card
// at least half on screen for a second), batched by the phone:
//
//   { sessionId?, items: [{ discountId, supermarket?, page, position? }] }
//
// Same store as the website's impressions (actions/track-event
// trackImpressions: validation, rate limit, one row per shopper per offer per
// surface per day). Impressions are the denominator every ranking signal
// needs — a click count alone cannot tell an unloved offer from an unseen
// one. The app only sends after «Αποδοχή» (mobile/src/lib/impressions.ts).
//
// As with /api/v1/events, `page` gets an `app/` prefix so a phone screen and
// the web page of the same name never mix in per-surface numbers.
import { NextResponse } from 'next/server';
import { trackImpressions } from '@/actions/track-event';
import { fail } from '@/lib/api/respond';

// The browser preview of the app sends JSON, which needs a CORS preflight;
// phones ignore CORS.
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid batch');

  const raw = body as { sessionId?: unknown; items?: unknown };
  if (!Array.isArray(raw.items)) return fail(400, 'invalid batch');
  const items = raw.items.map((it) => {
    const item = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const page = typeof item.page === 'string' && item.page ? `app/${item.page}` : 'app';
    return { ...item, page: page.slice(0, 64) };
  });

  const result = await trackImpressions({ sessionId: raw.sessionId, items });
  if ('rateLimited' in result && result.rateLimited) return fail(429, 'too many impressions');
  if (!result.success) return fail(400, 'invalid batch');
  return NextResponse.json({ ok: true }, { status: 202, headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
