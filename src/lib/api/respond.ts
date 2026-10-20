// Shared plumbing for the app API (/api/v1/…). See lib/api/deal-card.ts for
// the contract rules (additive-only within v1).
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

// Listings change at most every few minutes (the data functions already cache
// for 300 s under the `deals:default` tag), so let Vercel's edge answer
// repeat requests too: a launch-day spike of app opens then costs one
// database query per 5 minutes per distinct URL, not one per phone.
export const CDN_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

export function ok(data: unknown, cache: string | null = CDN_CACHE) {
  return NextResponse.json(data, {
    headers: cache ? { 'Cache-Control': cache } : { 'Cache-Control': 'no-store' },
  });
}

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'unknown';
}

// Per-IP guard for endpoints that reach the database on every call (search,
// anything uncached). Generous: mobile carriers put many phones behind one IP.
export function rateLimited(req: Request, bucket: string, max = 120): boolean {
  return !checkRateLimit(`api:${bucket}:${clientIp(req)}`, max, 60_000);
}

// Query-string helpers: absent or blank means "not given".
export function param(url: URL, name: string): string | undefined {
  const v = url.searchParams.get(name);
  return v != null && v.trim() !== '' ? v.trim() : undefined;
}
