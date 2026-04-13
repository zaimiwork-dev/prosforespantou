import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import OfferClientContent from "./OfferClientContent";

/**
 * Generates dynamic SEO metadata for the offer.
 * This ensures rich previews on Facebook, Viber, and WhatsApp.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;
  
  const offer = await prisma.discount.findUnique({
    where: { id },
    include: { store: true }
  });

  if (!offer) return { title: "Προσφορά μη διαθέσιμη | Προσφορές Παντού" };

  const storeName = offer.store?.name || "Σούπερ Μάρκετ";
  const title = `${offer.productName} - ${storeName} | Προσφορές Παντού`;
  const description = `Δες την προσφορά για ${offer.productName} στα ${storeName}. Τιμή: ${offer.discountedPrice}€ (${offer.discountPercent}% έκπτωση).`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: offer.imageUrl ? [offer.imageUrl] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: offer.imageUrl ? [offer.imageUrl] : [],
    },
  };
}

export default async function OfferPage({ params }) {
  const { id } = await params;

  const offer = await prisma.discount.findUnique({
    where: { id },
    include: { 
      store: true,
      leaflet: true
    }
  });

  if (!offer) notFound();

  // Convert dates to strings for the Client Component
  const serializedOffer = {
    ...offer,
    validFrom: offer.validFrom.toISOString(),
    validUntil: offer.validUntil.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };

  return <OfferClientContent offer={serializedOffer} />;
}
