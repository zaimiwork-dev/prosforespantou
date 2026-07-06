import { searchDeals } from "@/actions/search-deals";
import { getCatalogProducts } from "@/actions/get-catalog-products";
import { SearchPage } from "@/components/SearchPage";
import { dedupeDeals } from "@/lib/dedupe-deals";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return {
    title: q.trim() ? `"${q}" — Αναζήτηση` : "Αναζήτηση προσφορών",
  };
}

export default async function SearchRoute({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  // Offers first (the product), full-catalog matches as a secondary section:
  // products currently NOT on offer, shown with their last-known shelf price.
  const [rawDeals, catalog] = query.length >= 2
    ? await Promise.all([
        searchDeals(query),
        getCatalogProducts({ search: query, mode: "catalog", limit: 12 }),
      ])
    : [[], { products: [] as Awaited<ReturnType<typeof getCatalogProducts>>["products"], total: 0 }];

  const deals = dedupeDeals(rawDeals).map((d) => ({
    ...d,
    validFrom: d.validFrom?.toISOString?.() ?? d.validFrom,
    validUntil: d.validUntil?.toISOString?.() ?? d.validUntil,
    createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
    updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
  }));

  // Products whose match already surfaced as a deal add nothing here; keep the
  // section to catalog-only items so the two lists never show duplicates.
  const catalogProducts = catalog.products.filter((p) => !p.offer);

  return <SearchPage query={query} deals={deals} catalogProducts={catalogProducts} />;
}
