// src/lib/rate-limit.ts
const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Basic in-memory rate limiter.
 * Note: Resets on server restart/cold start.
 */
export function checkRateLimit(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count++;
  return true;
}
