import { getActiveDeals } from "@/actions/get-active-deals";
import DealsClient from "@/components/DealsClient";
import { SUPERMARKETS } from "@/lib/constants";

const INITIAL_LIMIT = 24;
const VALID_SM_IDS = new Set(SUPERMARKETS.map((s) => s.id));

export const metadata = {
  title: "Όλες οι προσφορές",
  description: "Περιήγηση σε όλες τις ενεργές προσφορές από όλα τα σούπερ μάρκετ της Ελλάδας.",
  alternates: { canonical: "/deals" },
};

export default async function DealsPage({ searchParams }) {
  const params = await searchParams;
  const rawSM = typeof params?.supermarket === "string" ? params.supermarket : "";
  const supermarkets = rawSM
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_SM_IDS.has(s));
  const category = typeof params?.category === "string" ? params.category : "all";
  const sort = typeof params?.sort === "string" ? params.sort : "expiring";

  const { deals, total } = await getActiveDeals(
    INITIAL_LIMIT,
    0,
    "all",
    category,
    sort,
    supermarkets.length > 0 ? supermarkets : undefined
  );

  return (
    <DealsClient
      initial={{ deals, total, supermarkets, category, sort }}
    />
  );
}
