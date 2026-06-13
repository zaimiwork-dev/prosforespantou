'use server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';
import { fetchFeedHealth } from '@/lib/pipeline-health';
import { fetchCatalogCoverage } from '@/lib/catalog-coverage';

// Feeds the admin Υγεία tab: per-feed status (ok/warn/stale/never) plus the
// most recent IngestRun rows for the history table.
export async function getIngestHealth() {
  return await Sentry.withServerActionInstrumentation('getIngestHealth', { recordResponse: true }, async () => {
    try {
      await requireAdmin();
      const [feeds, recentRuns, coverage] = await Promise.all([
        fetchFeedHealth(prisma),
        prisma.ingestRun.findMany({ orderBy: { finishedAt: 'desc' }, take: 30 }),
        fetchCatalogCoverage(prisma),
      ]);
      return { success: true, feeds, recentRuns, coverage };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Internal server error', feeds: [], recentRuns: [], coverage: null };
    }
  });
}
