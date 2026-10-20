// GET /api/v1/home — everything the app's home screen shows, from the same
// four calls the website's homepage makes (src/app/page.tsx), so both rank
// identically.
import * as Sentry from '@sentry/nextjs';
import { getTopDeals, getEndingSoonDeals, getWeeklyEssentials } from '@/actions/get-active-deals';
import { getDealCounts } from '@/actions/get-deal-counts';
import { toDealCard } from '@/lib/api/deal-card';
import { ok, fail } from '@/lib/api/respond';

export async function GET() {
  try {
    const [counts, essentials, topDeals, endingSoon] = await Promise.all([
      getDealCounts(),
      getWeeklyEssentials(),
      getTopDeals(20),
      getEndingSoonDeals(10),
    ]);
    return ok({
      total: counts.total,
      counts: { bySupermarket: counts.bySupermarket, byCategory: counts.byCategory },
      essentials: essentials.map(toDealCard),
      top: topDeals.map(toDealCard),
      endingSoon: endingSoon.map(toDealCard),
    });
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'home unavailable');
  }
}
