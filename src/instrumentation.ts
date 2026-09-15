// Server-side observability entry point (Next.js file convention).
//
// @sentry/nextjs v8+ no longer auto-loads sentry.server.config / sentry.edge
// .config — they must be imported from here, or Sentry never initialises and
// every Sentry.captureException / captureMessage in src/actions and the
// pipeline-health watchdog is a silent no-op. That was the state of production
// until 2026-09-15: the config files existed, nothing imported them.
//
// Init is a no-op without SENTRY_DSN (Vercel's Sentry integration injects it),
// so this is safe in dev/CI.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config.js');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config.js');
  }
}

// Server Component / route errors caught by Next reach Sentry through here.
export const onRequestError = Sentry.captureRequestError;
