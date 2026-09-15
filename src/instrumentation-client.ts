// Client-side observability entry point (Next.js file convention, runs before
// the app becomes interactive). Loads the browser Sentry config — see the
// note in src/instrumentation.ts for why an explicit import is required.
// No-op without NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from '@sentry/nextjs';
import '../sentry.client.config.js';

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
