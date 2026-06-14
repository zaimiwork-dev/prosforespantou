// Public deal visibility guard.
//
// My Market's /offers scrape can over-classify plain catalog rows as offers
// when a card has no reference price and no printed offer label. Keep those
// rows in the database for audit/resolution, but do not present them as public
// deals until a stricter scraper run proves the promotion.
export const PUBLIC_DEAL_VISIBILITY_WHERE = {
  OR: [
    { supermarket: { not: 'mymarket' } },
    { originalPrice: { not: null } },
    { description: { not: null } },
  ],
};

export function withPublicDealVisibility(where: Record<string, any> = {}) {
  const existingAnd = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
  return {
    ...where,
    AND: [...existingAnd, PUBLIC_DEAL_VISIBILITY_WHERE],
  };
}

export function activePublicDealWhere(now = new Date(), where: Record<string, any> = {}) {
  return withPublicDealVisibility({
    isActive: true,
    validUntil: { gt: now },
    ...where,
  });
}
