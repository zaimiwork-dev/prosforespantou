// Verify two things:
//   (1) Pagination works on Wolt venue-content endpoint — walk next_page_token until done.
//   (2) AB Vassilopoulos has the same endpoint shape — try common slug patterns.

import fs from 'fs';

const HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://wolt.com',
  'Referer': 'https://wolt.com/',
};

function baseUrl(slug) {
  return `https://consumer-api.wolt.com/consumer-api/venue-content-api/v3/web/venue-content/slug/${slug}`;
}

async function fetchPage(slug, pageToken) {
  const url = pageToken ? `${baseUrl(slug)}?page_token=${encodeURIComponent(pageToken)}` : baseUrl(slug);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return { ok: false, status: res.status };
  const json = await res.json();
  return { ok: true, json, url };
}

function countItems(json) {
  let total = 0, withGtin = 0, withGreekGtin = 0;
  const sampleItems = [];
  for (const s of json.sections || []) {
    if (!Array.isArray(s.items)) continue;
    for (const item of s.items) {
      total++;
      if (item.barcode_gtin) withGtin++;
      if (item.barcode_gtin && /^1?52[01]\d{10}$/.test(item.barcode_gtin)) withGreekGtin++;
      if (sampleItems.length < 3) sampleItems.push({ name: item.name, gtin: item.barcode_gtin, price: item.price });
    }
  }
  return { total, withGtin, withGreekGtin, sampleItems, next: json.next_page_token || null };
}

async function walk(slug, maxPages = 200) {
  console.log(`\n📜 Walking pagination for: ${slug}`);
  let pageToken = null;
  let page = 0;
  let grandTotal = 0, grandWithGtin = 0, grandWithGreekGtin = 0;
  while (page < maxPages) {
    const r = await fetchPage(slug, pageToken);
    if (!r.ok) { console.log(`   ❌ stopped at page ${page} — HTTP ${r.status}`); break; }
    const stats = countItems(r.json);
    grandTotal += stats.total;
    grandWithGtin += stats.withGtin;
    grandWithGreekGtin += stats.withGreekGtin;
    page++;
    process.stdout.write(`\r   page ${page}: +${stats.total} items (total ${grandTotal}, ${grandWithGtin} with GTIN, ${grandWithGreekGtin} Greek)        `);
    if (!stats.next) { console.log(`\n   ✅ done — no more next_page_token after page ${page}.`); break; }
    pageToken = stats.next;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`   📊 final: ${grandTotal} items, ${grandWithGtin} with barcode_gtin (${((grandWithGtin/grandTotal)*100).toFixed(1)}%), ${grandWithGreekGtin} with Greek GTIN`);
  return { total: grandTotal, withGtin: grandWithGtin };
}

async function probeSlug(slug) {
  const r = await fetchPage(slug, null);
  if (!r.ok) return { slug, ok: false, status: r.status };
  const stats = countItems(r.json);
  return { slug, ok: true, ...stats };
}

async function findAbSlug() {
  console.log(`\n🔎 Looking for AB Vassilopoulos venue slug on Wolt`);
  const candidates = [
    'ab-vasilopoulos',
    'ab-vassilopoulos',
    'ab-vasilopoulos-athens',
    'ab-vasilopoulos-thessaloniki',
    'ab-vasilopoulos-glyfada',
    'ab-vasilopoulos-pireas',
    'ab-vasilopoulos-marousi',
    'ab',
    'alpha-beta-vasilopoulos',
    'ab-thessaloniki',
    'ab-athens',
  ];
  const found = [];
  for (const s of candidates) {
    const r = await probeSlug(s);
    const tag = r.ok ? '✅' : '❌';
    console.log(`   ${tag} ${r.ok ? r.total + ' items' : 'HTTP ' + r.status} — slug "${s}"`);
    if (r.ok && r.total > 0) found.push(r);
    await new Promise((r) => setTimeout(r, 250));
  }
  return found;
}

async function searchWolt(query) {
  console.log(`\n🔎 Wolt venue search for "${query}"`);
  const url = `https://restaurant-api.wolt.com/v1/pages/search?q=${encodeURIComponent(query)}&lat=37.9838&lon=23.7275`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) { console.log(`   ❌ HTTP ${res.status}`); return []; }
    const json = await res.json();
    // Walk the response looking for venue objects with slugs
    const slugs = new Set();
    function walk(obj) {
      if (!obj) return;
      if (Array.isArray(obj)) return obj.forEach(walk);
      if (typeof obj === 'object') {
        if (obj.slug && typeof obj.slug === 'string' && /^[a-z][a-z0-9-]+$/.test(obj.slug)) slugs.add(obj.slug);
        Object.values(obj).forEach(walk);
      }
    }
    walk(json);
    const candidates = [...slugs].filter((s) => /^ab|alpha-beta|vasilopoulos/i.test(s));
    console.log(`   found ${slugs.size} slugs total, ${candidates.length} AB-related:`);
    candidates.forEach((s) => console.log(`     • ${s}`));
    return candidates;
  } catch (e) {
    console.log(`   error: ${e.message}`);
    return [];
  }
}

async function run() {
  // (1) Pagination
  const m = await walk('masoutis-makedonias', 50);
  fs.writeFileSync('./library_data/barcode_probe_wolt/pagination_summary.json',
    JSON.stringify({ slug: 'masoutis-makedonias', ...m }, null, 2));

  // (2) AB existence
  let abSlugs = await findAbSlug();
  if (!abSlugs.length) {
    const fromSearch = await searchWolt('AB Vassilopoulos');
    for (const s of fromSearch) {
      const r = await probeSlug(s);
      if (r.ok && r.total > 0) abSlugs.push(r);
    }
  }
  if (abSlugs.length) {
    console.log(`\n✅ AB confirmed on Wolt. Slugs that work:`);
    for (const r of abSlugs) {
      const greekPct = r.total ? ((r.withGreekGtin / r.total) * 100).toFixed(0) : 0;
      console.log(`   • "${r.slug}" — first page: ${r.total} items, ${r.withGtin} with GTIN, ${r.withGreekGtin} Greek GTIN (${greekPct}%)`);
      r.sampleItems.forEach((it) => console.log(`       sample: ${it.name} | gtin=${it.gtin} | price=${it.price}`));
    }
  } else {
    console.log(`\n⚠️  No AB slug found via simple patterns. Need to discover via Wolt's city listing.`);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
