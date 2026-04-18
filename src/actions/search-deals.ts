'use server';

import prisma from '@/lib/prisma';
import * as Sentry from "@sentry/nextjs";

const GREEKLISH_MAP: Record<string, string> = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ',
};

function greeklishToGreek(text: string): string {
  const lower = text.toLowerCase();
  let result = '';
  let i = 0;
  while (i < lower.length) {
    const two = lower[i] + (lower[i + 1] ?? '');
    if (GREEKLISH_MAP[two]) { result += GREEKLISH_MAP[two]; i += 2; }
    else if (GREEKLISH_MAP[lower[i]]) { result += GREEKLISH_MAP[lower[i]]; i++; }
    else { result += lower[i]; i++; }
  }
  return result;
}

export async function searchDeals(query: string) {
  return await Sentry.withServerActionInstrumentation('searchDeals', { recordResponse: true }, async () => {
    if (!query || query.trim().length < 2) return [];

    try {
      const raw = query.trim();
      const isLatin = /^[a-zA-Z\s]+$/.test(raw);
      const searchTerm = isLatin ? greeklishToGreek(raw) : raw;
      const like = `%${searchTerm}%`;

      // unaccent() strips accents so "κοτοπουλο" matches "κοτόπουλο"
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM discounts
        WHERE is_active = true
          AND valid_until > NOW()
          AND (
            unaccent(lower(product_name)) LIKE unaccent(lower(${like}))
            OR unaccent(lower(COALESCE(description, ''))) LIKE unaccent(lower(${like}))
            OR unaccent(lower(COALESCE(category, ''))) LIKE unaccent(lower(${like}))
          )
        ORDER BY valid_until ASC
        LIMIT 50
      `;

      if (rows.length === 0) return [];

      return await prisma.discount.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        include: { store: true, leaflet: true, product: true },
        orderBy: { validUntil: 'asc' },
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error searching deals:', error);
      throw new Error('Failed to search deals');
    }
  });
}
