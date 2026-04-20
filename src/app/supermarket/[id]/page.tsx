import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { SUPERMARKETS } from "@/lib/constants";
import SupermarketClient from "@/components/SupermarketClient";
import { pruneExpiredDatelessLeaflets } from "@/actions/admin/leaflet-actions";

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
  const [deals, leaflet] = await Promise.all([
    prisma.discount.findMany({
      where: {
        supermarket: id,
        isActive: true,
        validUntil: { gt: now },
      },
      include: { store: true, leaflet: true, product: true },
      orderBy: [{ discountPercent: "desc" }, { validUntil: "asc" }],
      take: 200,
    }),
    prisma.leaflet.findFirst({
      where: {
        store: { name: sm.name },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      orderBy: { validFrom: "desc" },
    }),
  ]);

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

  return <SupermarketClient sm={sm} initialDeals={serializedDeals} leaflet={serializedLeaflet} />;
}
