import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import OfferClientContent from "./OfferClientContent";
import { getPriceComparison } from "@/actions/get-price-comparison";
import { unstable_cache } from 'next/cache';
import { SUPERMARKETS } from "@/lib/constants";

const getCachedOffer = (id) => unstable_cache(
  async () => {
    return await prisma.discount.findUnique({
      where: { id },
      include: { 
        store: true,
        leaflet: true,
        product: true
      }
    });
  },
  [`offer:${id}`],
  { tags: [`offer:${id}`], revalidate: 300 }
)();

/**
 * Generates dynamic SEO metadata for the offer.
 * This ensures rich previews on Facebook, Viber, and WhatsApp.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;
  
  const offer = await getCachedOffer(id);

  if (!offer) return { title: "Προσφορά μη διαθέσιμη" };

  const storeName = offer.store?.name || "Σούπερ Μάρκετ";
  const title = offer.productName;
  
  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const expiryStr = offer.validUntil ? ` έως ${formatDate(offer.validUntil)}` : "";
  const description = `${offer.productName} στα ${storeName}. Τιμή: ${offer.discountedPrice}€ (${offer.discountPercent}% έκπτωση)${expiryStr}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/offer/${id}`,
    },
    openGraph: {
      title,
      description,
      images: offer.imageUrl ? [offer.imageUrl] : [],
      type: "website",
      locale: "el_GR",
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

  const offer = await getCachedOffer(id);

  if (!offer) notFound();

  const toIso = (v) => (v instanceof Date ? v.toISOString() : v);
  const serializedOffer = {
    ...offer,
    validFrom: toIso(offer.validFrom),
    validUntil: toIso(offer.validUntil),
    createdAt: toIso(offer.createdAt),
    updatedAt: toIso(offer.updatedAt),
  };

  const comparison = await getPriceComparison(id);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://prosforespantou.gr";
  const supermarketName = SUPERMARKETS.find(s => s.id === offer.supermarket)?.name || "Σούπερ Μάρκετ";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": offer.productName,
    "description": offer.description || undefined,
    "image": offer.imageUrl ? [offer.imageUrl] : undefined,
    "category": offer.category,
    "offers": {
      "@type": "Offer",
      "price": offer.discountedPrice,
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock",
      "priceValidUntil": toIso(offer.validUntil),
      "seller": { "@type": "Organization", "name": offer.store?.name || supermarketName },
      "url": `${baseUrl}/offer/${offer.id}`
    }
  };

  // Strip undefined
  const cleanJsonLd = JSON.parse(JSON.stringify(jsonLd));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cleanJsonLd) }}
      />
      <OfferClientContent offer={serializedOffer} comparison={comparison} />
    </>
  );
}
