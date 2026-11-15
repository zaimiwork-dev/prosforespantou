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
    const index = await getSuggestIndex();
    return ok(suggest(index, parsed.data.q));
  } catch (error) {
    Sentry.captureException(error);
    console.error('[api/v1] suggest unavailable:', error);
    return fail(500, 'suggest unavailable');
  }
}
