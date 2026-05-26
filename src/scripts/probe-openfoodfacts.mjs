// One-shot probe: how often does OpenFoodFacts return an EAN for popular Greek grocery items?
// No DB, no env. Just fetch.

const ITEMS = [
  { brand: 'ΔΕΛΤΑ',         name: 'γάλα πλήρες 1L' },
  { brand: 'ΦΑΓΕ',          name: 'Total γιαούρτι 2%' },
  { brand: 'Παπαδοπούλου',  name: 'Πτι Μπερ μπισκότα' },
  { brand: 'Μινέρβα',       name: 'ελαιόλαδο extra παρθένο' },
  { brand: 'Μέλισσα',       name: 'σπαγκέτι Νο 6' },
  { brand: 'Coca-Cola',     name: '1.5L' },
  { brand: 'Pampers',       name: 'Pants Νο 5' },
  { brand: 'Nescafé',       name: 'Classic στιγμιαίος καφές' },
  { brand: 'Knorr',         name: 'σούπα κοτόπουλο' },
  { brand: "Lay's",         name: 'πατατάκια original' },
];

const ENDPOINT = 'https://world.openfoodfacts.org/cgi/search.pl';

async function lookup(brand, name) {
  const params = new URLSearchParams({
    search_terms: `${brand} ${name}`,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '5',
    fields: 'code,product_name,brands,countries_tags,quantity',
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'prosforespantou-probe/0.1 (silvizaimi1999@gmail.com)' },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  const hits = (data.products || []).filter((p) => p.code && /^\d{8,14}$/.test(p.code));
  return { ok: true, count: data.count ?? hits.length, top: hits[0] || null, sample: hits.slice(0, 3) };
}

function fmt(r) {
  if (!r.ok) return `   ❌ HTTP ${r.status}`;
  if (!r.top) return `   ⚠️  no hits (count=${r.count})`;
  const t = r.top;
  return `   ✅ EAN=${t.code}  brand="${t.brands || '?'}"  name="${(t.product_name || '').slice(0, 60)}"  qty="${t.quantity || '?'}"`;
}

async function run() {
  console.log(`🔍 Probing OpenFoodFacts for ${ITEMS.length} popular Greek items\n`);
  let hits = 0;
  for (const item of ITEMS) {
    console.log(`• ${item.brand} — ${item.name}`);
    try {
      const r = await lookup(item.brand, item.name);
      console.log(fmt(r));
      if (r.ok && r.top) hits++;
    } catch (e) {
      console.log(`   ❌ error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`\n📊 ${hits}/${ITEMS.length} items returned an EAN-shaped code (${Math.round((hits / ITEMS.length) * 100)}%).`);
}

run().catch((e) => { console.error(e); process.exit(1); });
