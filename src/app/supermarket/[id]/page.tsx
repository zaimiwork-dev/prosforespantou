import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { SUPERMARKETS } from "@/lib/constants";
import SupermarketClient from "@/components/SupermarketClient";
import { pruneExpiredDatelessLeaflets } from "@/actions/admin/leaflet-actions";
import { activePublicDealWhere } from "@/lib/public-deal-filters";
import { representativeCatalogCount } from "@/lib/catalog-run-count";
import { buildSupermarketCategoryTree } from "@/lib/supermarket-category-browser";

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const sm = SUPERMARKETS.find((s) => s.id === id);
  if (!sm) return { title: "Supermarket" };
  return {
    title: `Προσφορές ${sm.name}`,
    description: `Δες όλες τις ενεργές προσφορές του ${sm.name} σε ένα μέρος.`,
    alternates: {
      canonical: `/supermarket/${id}`,
    },
  };
}

export default async function SupermarketPage({ params }) {
  const { id } = await params;
  const sm = SUPERMARKETS.find((s) => s.id === id);
  if (!sm) notFound();

  await pruneExpiredDatelessLeaflets();

  const now = new Date();
  // Cap the initial server payload to the 500 hottest deals. Without a cap,
  // chains with thousands of active deals (Kritikos: 2,760) ship a
  // multi-megabyte RSC payload to mobile users on every page load. Ordered by
  // hotScore so the cap keeps the deals the page defaults to showing first; the
  // full catalog is reachable via the in-page search, which calls a paginated
  // server action (`searchDeals(query, supermarket)`) for queries ≥ 2 chars.
  const [deals, totalCount, leaflet, catalogRuns, taxonomyDeals] = await Promise.all([
    prisma.discount.findMany({
      where: activePublicDealWhere(now, { supermarket: id }),
      include: { store: true, leaflet: true, product: true },
      orderBy: [{ hotScore: "desc" }, { validUntil: "asc" }],
      take: 500,
    }),
    prisma.discount.count({
      where: activePublicDealWhere(now, { supermarket: id }),
    }),
    prisma.leaflet.findFirst({
      where: {
        store: { name: sm.name },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      orderBy: { validFrom: "desc" },
    }),
    prisma.ingestRun.findMany({
      where: {
        chain: id,
        source: { in: ["catalog", "baseline"] },
        healthOk: true,
        scrapedItems: { gt: 0 },
      },
      orderBy: { finishedAt: "desc" },
      take: 30,
      select: { scrapedItems: true },
    }),
    prisma.discount.findMany({
      where: activePublicDealWhere(now, { supermarket: id }),
      orderBy: [{ hotScore: "desc" }, { validUntil: "asc" }],
      select: {
        category: true,
        subcategory: true,
        productName: true,
        imageUrl: true,
      },
    }),
  ]);
  const catalogCount = representativeCatalogCount(catalogRuns);
  const categoryTree = buildSupermarketCategoryTree(taxonomyDeals);

  const serializedDeals = deals.map((d) => ({
    ...d,
    validFrom: d.validFrom?.toISOString?.() ?? d.validFrom,
    validUntil: d.validUntil?.toISOString?.() ?? d.validUntil,
    createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
    updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
  }));

  const serializedLeaflet = leaflet
    ? {
        id: leaflet.id,
        title: leaflet.title,
        pdfUrl: leaflet.pdfUrl,
        validFrom: leaflet.validFrom?.toISOString?.() ?? null,
        validUntil: leaflet.validUntil?.toISOString?.() ?? null,
      }
    : null;

  return (
    <SupermarketClient
      sm={sm}
      initialDeals={serializedDeals}
      totalCount={totalCount}
      catalogCount={catalogCount}
      categoryTree={categoryTree}
      leaflet={serializedLeaflet}
    />
  );
}
