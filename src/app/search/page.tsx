import { searchDeals } from "@/actions/search-deals";
import { SearchPage } from "@/components/SearchPage";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return {
    title: q.trim() ? `"${q}" — Αναζήτηση` : "Αναζήτηση προσφορών",
  };
}

export default async function SearchRoute({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const rawDeals = query.length >= 2 ? await searchDeals(query) : [];

  const deals = rawDeals.map((d) => ({
    ...d,
    validFrom: d.validFrom?.toISOString?.() ?? d.validFrom,
    validUntil: d.validUntil?.toISOString?.() ?? d.validUntil,
    createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
    updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
  }));

  return <SearchPage query={query} deals={deals} />;
}
