import { getActiveDeals } from "@/actions/get-active-deals";
import DealsClient from "@/components/DealsClient";

const INITIAL_LIMIT = 24;

export const metadata = {
  title: "Όλες οι προσφορές",
  description: "Περιήγηση σε όλες τις ενεργές προσφορές από όλα τα σούπερ μάρκετ της Ελλάδας.",
  alternates: { canonical: "/deals" },
};

export default async function DealsPage({ searchParams }) {
  const params = await searchParams;
  const supermarket = typeof params?.supermarket === "string" ? params.supermarket : "all";
  const category = typeof params?.category === "string" ? params.category : "all";
  const sort = typeof params?.sort === "string" ? params.sort : "expiring";

  const { deals, total } = await getActiveDeals(INITIAL_LIMIT, 0, supermarket, category, sort);

  return (
    <DealsClient
      initial={{ deals, total, supermarket, category, sort }}
    />
  );
}
