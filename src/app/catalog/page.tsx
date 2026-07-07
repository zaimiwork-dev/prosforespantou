import CatalogClient from '@/components/CatalogClient';
import { getCatalogFacets, getCatalogProducts } from '@/actions/get-catalog-products';
import { SUPERMARKETS } from '@/lib/constants';

export const metadata = {
  title: 'Όλα τα προϊόντα',
  description: 'Περιήγηση σε ολόκληρο τον κατάλογο προϊόντων — με τιμή όταν κάτι είναι σε προσφορά.',
  alternates: { canonical: '/catalog' },
};

// Live catalog — render per request (the initial page is just offset 0; search
// + infinite scroll fetch the rest via the server action).
export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ supermarket?: string }> }) {
  // Deep link from the supermarket pages: /catalog?supermarket=ab preselects
  // that chain's full catalog. Unknown slugs fall back to 'all'.
  const { supermarket } = await searchParams;
  const store = supermarket && SUPERMARKETS.some((s) => s.id === supermarket) ? supermarket : 'all';

  const [catalog, facets] = await Promise.all([
    getCatalogProducts({ limit: 24, offset: 0, supermarket: store }),
    getCatalogFacets(),
  ]);
  return <CatalogClient initial={{ ...catalog, facets }} initialStore={store} />;
}
