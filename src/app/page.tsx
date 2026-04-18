import { getTopDeals, getEndingSoonDeals } from "@/actions/get-active-deals";
import { getDealCounts } from "@/actions/get-deal-counts";
import { isAdminAuthenticated } from "@/actions/admin-session";
import HomeClient from "@/components/HomeClient";

export default async function Home() {
  const [counts, admin, topDeals, endingSoon] = await Promise.all([
    getDealCounts(),
    isAdminAuthenticated(),
    getTopDeals(10),
    getEndingSoonDeals(10),
  ]);

  const initial = {
    total: counts.total,
    counts,
    topDeals,
    endingSoon,
  };

  return <HomeClient initial={initial} initiallyAdmin={admin} />;
}
