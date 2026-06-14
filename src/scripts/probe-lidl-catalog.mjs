// Lidl Hellas catalog discovery. The e-shop DOES exist (/c/{slug}/s{id}?offset=N),
// products embedded as JSON in the page. Find: the product array, its fields
// (name/price/size/image/id), and the category list (/c/.../s{id}).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const URL = process.env.URL || 'https://www.lidl-hellas.gr/c/fagito-poto/s10068374?offset=24';

function scriptJsons(html) {
  const out = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m; while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch {} }
  // also __NEXT_DATA__-style or window.__PRELOADED__
  return out;
}

function findProductArrays(json) {
  let best = null;
  const looksProduct = (o) => o && typeof o === 'object' &&
    (o.canonicalPath || o.canonicalUrl || o.fullTitle || o.keyfacts || o.brand) &&
    (o.price != null || o.fullPriceText != null);
  const walk = (o) => {
    if (Array.isArray(o)) {
      const ps = o.filter(looksProduct);
      if (ps.length && (!best || ps.length > best.length)) best = ps;
      o.forEach(walk);
    } else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(json);
  return best;
}

async function run() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA, 'Accept-Language': 'el-GR,el;q=0.9' } });
  const html = await res.text();
  console.log(`HTTP ${res.status}, ${html.length}b`);

  const jsons = scriptJsons(html);
  console.log(`application/json script blocks: ${jsons.length}`);
  let products = null;
  for (const j of jsons) { const p = findProductArrays(j); if (p && (!products || p.length > products.length)) products = p; }

  if (products) {
    console.log(`\n🎯 product array: ${products.length} items`);
    const p = products[0];
    console.log(`keys: ${Object.keys(p).join(', ')}`);
    // The blob is index-dehydrated — values are indices into the root flat array.
    const root = jsons.find((j) => Array.isArray(j)) || jsons[0];
    const isFlat = Array.isArray(root);
    console.log(`\nroot is flat array: ${isFlat} (len ${isFlat ? root.length : 'n/a'})`);
    const R = (v, depth = 0) => {
      if (!isFlat || depth > 3) return v;
      if (typeof v === 'number' && v >= 0 && v < root.length) {
        const r = root[v];
        if (r && typeof r === 'object') {
          const o = Array.isArray(r) ? r.map((x) => R(x, depth + 1)) : Object.fromEntries(Object.entries(r).map(([k, x]) => [k, R(x, depth + 1)]));
          return o;
        }
        return r;
      }
      return v;
    };
    const Rd = (v, d = 0) => { // deep resolver
      if (!isFlat || d > 8) return v;
      if (typeof v === 'number' && v >= 0 && v < root.length) {
        const r = root[v];
        if (r && typeof r === 'object') return Array.isArray(r) ? r.map((x) => Rd(x, d + 1)) : Object.fromEntries(Object.entries(r).map(([k, x]) => [k, Rd(x, d + 1)]));
        return r;
      }
      return v;
    };
    const full = Rd(p);
    console.log(`\nFULLY RESOLVED product:\n${JSON.stringify(full, null, 1).slice(0, 1800)}`);
  } else {
    console.log('no product array found in JSON blobs — dumping top-level keys of biggest blob');
    const big = jsons.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
    if (big) console.log(Object.keys(big).join(', '));
  }

  // Category list: /c/{slug}/s{id}
  const cats = [...new Set([...html.matchAll(/\/c\/([a-z0-9\-]+)\/(s\d+)/g)].map((m) => `${m[2]}  /c/${m[1]}/${m[2]}`))];
  console.log(`\ncategory links (/c/.../s###): ${cats.length}`);
  cats.slice(0, 30).forEach((c) => console.log(`   ${c}`));
}
run().catch((e) => { console.error(e); process.exit(1); });
