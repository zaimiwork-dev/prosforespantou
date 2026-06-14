import CatalogClient from '@/components/CatalogClient';
import { getCatalogFacets, getCatalogProducts } from '@/actions/get-catalog-products';

export const metadata = {
  title: 'Όλα τα προϊόντα',
  description: 'Περιήγηση σε ολόκληρο τον κατάλογο προϊόντων — με τιμή όταν κάτι είναι σε προσφορά.',
  alternates: { canonical: '/catalog' },
};

// Live catalog — render per request (the initial page is just offset 0; search
// + infinite scroll fetch the rest via the server action).
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const [catalog, facets] = await Promise.all([
    getCatalogProducts({ limit: 24, offset: 0 }),
    getCatalogFacets(),
  ]);
  return <CatalogClient initial={{ ...catalog, facets }} />;
}
