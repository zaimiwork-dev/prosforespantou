// GET /api/v1/suggest?q=γαλ — completions while the shopper types: up to 8
// phrases with offer counts and up to 3 departments. Answered from a cached
// in-memory index (get-suggest-index), never a per-keystroke table scan; the
// rate limit is generous because every keystroke (debounced) is one call.
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSuggestIndex } from '@/actions/get-suggest-index';
import { suggest } from '@/lib/suggest';
import { ok, fail, param, rateLimited } from '@/lib/api/respond';

const Query = z.object({ q: z.string().min(2).max(40) });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ q: param(url, 'q') });
  if (!parsed.success) return fail(400, 'invalid query');
  if (rateLimited(req, 'suggest', 300)) return fail(429, 'too many requests');

  try {
    // Typeahead has to feel instant, so the two halves are timed and sent as
    // Server-Timing (visible in curl -D and browser dev tools): `index` is the
    // cached index read, `match` the scan over it.
    const t0 = performance.now();
    const index = await getSuggestIndex();
    const t1 = performance.now();
    const result = suggest(index, parsed.data.q);
    const t2 = performance.now();
    const res = ok(result);
    res.headers.set('Server-Timing', `index;dur=${(t1 - t0).toFixed(1)}, match;dur=${(t2 - t1).toFixed(1)}`);
    return res;
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1] suggest unavailable:', error);
    return fail(500, 'suggest unavailable');
  }
}
