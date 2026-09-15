import { getTopDeals, getEndingSoonDeals, getWeeklyEssentials } from "@/actions/get-active-deals";
import { getDealCounts } from "@/actions/get-deal-counts";
import HomeClient from "@/components/HomeClient";

// The homepage is the same HTML for every visitor (everything personal is a
// post-hydration client fetch), so let Next cache it. It used to await
// isAdminAuthenticated() here — a cookie read that forced dynamic rendering
// (`no-store`) on the most-visited page and put a serverless cold start
// (measured 5.7 s TTFB) in front of every first visit. The admin check now
// happens lazily, only when the hidden double-click trigger fires.
// Admin actions that change listings call revalidateTag('deals:default'),
// which the cached data below is tagged with, so a 300 s window is the
// worst-case staleness.
export const revalidate = 300;

export default async function Home() {
  const [counts, essentials, topDeals, endingSoon] = await Promise.all([
    getDealCounts(),
    getWeeklyEssentials(),
    getTopDeals(20), // two-row carousel needs the doubled pool
    getEndingSoonDeals(10),
  ]);

  const initial = {
    total: counts.total,
    counts,
    essentials,
    topDeals,
    endingSoon,
  };

  return <HomeClient initial={initial} />;
}
