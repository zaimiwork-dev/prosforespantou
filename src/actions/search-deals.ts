'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import * as Sentry from "@sentry/nextjs";

const GREEKLISH_MAP: Record<string, string> = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ',
};

const SYNONYMS = [
  ['gouda', 'γουδα', 'γκουντα'],
  ['bacon', 'μπεικον', 'μπεηκον'],
  ['edam', 'ενταμ'],
  ['cheddar', 'τσενταρ'],
  ['kelloggs', 'κελογκς'],
  ['quaker', 'κουακερ'],
  ['pampers', 'παμπερς']
];

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

function expandSearch(query: string): string[] {
  const raw = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const terms = new Set<string>([raw]);
  
  const isLatin = /^[a-zA-Z\s]+$/.test(raw);
  if (isLatin) {
    const greek = greeklishToGreek(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    terms.add(greek);
    
    // Fallback ambiguity fixes for Greeklish -> Greek
    if (raw.includes('x')) terms.add(greek.replace(/ξ/g, 'χ'));
    if (raw.includes('h')) {
       terms.add(greek.replace(/η/g, 'χ'));
       terms.add(greek.replace(/η/g, 'ι'));
    }
    if (raw.includes('u')) terms.add(greek.replace(/ου/g, 'υ'));
    if (raw.includes('y')) terms.add(greek.replace(/υ/g, 'ι'));
    if (raw.includes('w')) terms.add(greek.replace(/ω/g, 'ο'));
    if (raw.includes('b')) terms.add(greek.replace(/β/g, 'μπ'));
    if (raw.includes('d')) terms.add(greek.replace(/δ/g, 'ντ'));
    if (raw.includes('g')) terms.add(greek.replace(/γ/g, 'γκ'));
    if (raw.includes('c')) terms.add(greek.replace(/ψ/g, 'κ').replace(/τσ/g, 'κ')); // 'c' often maps weirdly
  } else {
    // Reverse translation: Greek -> Latin
    const grToLat: Record<string, string> = {
      'α':'a', 'β':'v', 'γ':'g', 'δ':'d', 'ε':'e', 'ζ':'z', 'η':'h', 'θ':'th',
      'ι':'i', 'κ':'k', 'λ':'l', 'μ':'m', 'ν':'n', 'ξ':'x', 'ο':'o', 'π':'p',
      'ρ':'r', 'σ':'s', 'ς':'s', 'τ':'t', 'υ':'y', 'φ':'f', 'χ':'x', 'ψ':'ps', 'ω':'o'
    };
    let latin = '';
    for (let i=0; i<raw.length; i++) {
      latin += grToLat[raw[i]] || raw[i];
    }
    terms.add(latin);
    
    // Fallback ambiguity fixes for Greek -> Latin
    if (raw.includes('χ')) {
      terms.add(latin.replace(/x/g, 'h'));
      terms.add(latin.replace(/x/g, 'ch'));
    }
    if (raw.includes('η')) terms.add(latin.replace(/h/g, 'i'));
    if (raw.includes('υ')) {
      terms.add(latin.replace(/y/g, 'u'));
      terms.add(latin.replace(/y/g, 'i'));
    }
    if (raw.includes('ω')) terms.add(latin.replace(/o/g, 'w'));
    if (raw.includes('β')) terms.add(latin.replace(/v/g, 'b'));
  }

  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    for (const group of SYNONYMS) {
      for (const syn of group) {
        if (term.includes(syn)) {
          for (const s of group) {
             expanded.add(term.replace(syn, s));
          }
        }
      }
    }
  }
  return Array.from(expanded);
}

export async function searchDeals(query: string) {
  return await Sentry.withServerActionInstrumentation('searchDeals', { recordResponse: true }, async () => {
    if (!query || query.trim().length < 2) return [];

    try {
      const expandedTerms = expandSearch(query);

      const conditions = expandedTerms.map(term => Prisma.sql`
        (unaccent(lower(product_name)) LIKE unaccent(lower(${'%' + term + '%'}))
        OR unaccent(lower(COALESCE(description, ''))) LIKE unaccent(lower(${'%' + term + '%'}))
        OR unaccent(lower(COALESCE(category, ''))) LIKE unaccent(lower(${'%' + term + '%'})))
      `);

      const joinedConditions = Prisma.join(conditions, ' OR ');

      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM discounts
        WHERE is_active = true
          AND valid_until > NOW()
          AND (${joinedConditions})
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
