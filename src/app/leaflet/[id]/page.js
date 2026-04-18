import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import LeafletViewerClient from "./LeafletViewerClient";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const leaflet = await prisma.leaflet.findUnique({
    where: { id },
    include: { store: true }
  });

  if (!leaflet) return { title: "Φυλλάδιο μη διαθέσιμο" };

  return {
    title: `${leaflet.title || 'Φυλλάδιο Προσφορών'} - ${leaflet.store.name}`,
    description: `Δείτε το τρέχον φυλλάδιο προσφορών του καταστήματος ${leaflet.store.name}.`,
  };
}

export default async function LeafletPage({ params }) {
  const { id } = await params;
  const leaflet = await prisma.leaflet.findUnique({
    where: { id },
    include: { store: true }
  });

  if (!leaflet) notFound();

  // Serialize for client component
  const serialized = {
    ...leaflet,
    validFrom: leaflet.validFrom.toISOString(),
    validUntil: leaflet.validUntil.toISOString(),
    createdAt: leaflet.createdAt.toISOString(),
    updatedAt: leaflet.updatedAt.toISOString(),
  };

  return <LeafletViewerClient leaflet={serialized} />;
}
