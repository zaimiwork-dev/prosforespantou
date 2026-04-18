import prisma from "@/lib/prisma";
import { SUPERMARKETS } from "@/lib/constants";

export default async function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://prosforespantou.gr";

  // Get all active offers
  const now = new Date();
  const offers = await prisma.discount.findMany({
    where: {
      isActive: true,
      validUntil: { gt: now },
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });

  const offerUrls = offers.map((offer) => ({
    url: `${baseUrl}/offer/${offer.id}`,
    lastModified: offer.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const supermarketUrls = SUPERMARKETS.map((sm) => ({
    url: `${baseUrl}/supermarket/${sm.id}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/deals`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...supermarketUrls,
    ...offerUrls,
  ];
}
