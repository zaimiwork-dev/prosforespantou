// Can we get a real GTIN/EAN for a Masoutis offer item?
// The offers API gives Itemcode but no barcode. Masoutis has a Scan-N-Shop
// barcode-scanner feature, so EANs must exist somewhere in their backend.
//
// Tries, for one known offer Itemcode:
//   A) the product-detail page HTML (JSON-LD / meta / inline) for a 13-digit EAN
//   B) Scan-N-Shop / item-detail JSON endpoints, walking the response for
//      barcode-shaped fields or Greek-prefix EAN strings.

const ITEMCODE = '2673101'; // "Fairy Ultra 900ml" — a packaged good, must have an EAN
const DETAIL_PATH = '/categories/product/fairy-ultra-ygro-aporrypantiko-piaton-original-900ml';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'el-GR,el;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.masoutis.gr',
  Referer: 'https://www.masoutis.gr/',
};

const GREEK_EAN = /(?<!\d)52[01]\d{10}(?!\d)/g;
const ANY_EAN13 = /(?<!\d)\d{13}(?!\d)/g;

function eanHits(text) {
  const greek = [...new Set([...String(text).matchAll(GREEK_EAN)].map((m) => m[0]))];
  const any = [...new Set([...String(text).matchAll(ANY_EAN13)].map((m) => m[0]))];
  return { greek, any };
}

function walkForBarcodeFields(obj, hits = [], path = '') {
  if (obj == null) return hits;
  if (Array.isArray(obj)) { obj.forEach((v, i) => walkForBarcodeFields(v, hits, `${path}[${i}]`)); return hits; }
  if (typeof obj !== 'object') return hits;
  for (const [k, v] of Object.entries(obj)) {
    if (/ean|gtin|barcode|bcode/i.test(k)) hits.push({ path: path ? `${path}.${k}` : k, value: v });
    walkForBarcodeFields(v, hits, path ? `${path}.${k}` : k);
  }
  return hits;
}

async function tryUrl(url, opts = {}) {
  try {
    const res = await fetch(url, { headers: HEADERS, ...opts });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { url, status: res.status, ct: res.headers.get('content-type') || '', text, json };
  } catch (e) { return { url, error: e.message }; }
}

async function getCred() {
  const r = await tryUrl('https://www.masoutis.gr/api/eshop/GetCred', { headers: { ...HEADERS, authorization: 'Bearer null' } });
  return r.json ? { uid: r.json.Uid, usl: r.json.Usl, key: r.json.Key } : null;
}

async function run() {
  const cred = await getCred();
  console.log(`cred: ${cred ? 'ok' : 'FAILED'}\n`);

  console.log('━━ A) product-detail page HTML ━━');
  const detail = await tryUrl(`https://www.masoutis.gr${DETAIL_PATH}`);
  if (detail.error) console.log(`  err: ${detail.error}`);
  else {
    console.log(`  HTTP ${detail.status}, ${detail.text.length}b`);
    const h = eanHits(detail.text);
    console.log(`  Greek-EAN hits: ${h.greek.length ? h.greek.slice(0, 6).join(', ') : 'none'}`);
    if (!h.greek.length && h.any.length) console.log(`  other 13-digit: ${h.any.slice(0, 6).join(', ')}`);
  }

  console.log('\n━━ B) item-detail / scan endpoints ━━');
  const endpoints = [
    { url: `https://www.masoutis.gr/api/eshop/GetPromoItemWithListCouponsSubCategoriesAutoPromosv2`,
      opts: { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json', uid: cred?.uid, usl: cred?.usl, key: cred?.key },
        body: JSON.stringify({ PassKey: 'Sc@NnSh0p', Itemcode: ITEMCODE, ItemDescr: '0', IfWeight: '0', ServiceResponse: '', Token: '', Zip: '', BrandName: '', TeamId: '', ExtraFilter: '' }) } },
    { url: `https://www.masoutis.gr/api/eshop/GetItemByItemcode?itemcode=${ITEMCODE}` },
    { url: `https://www.masoutis.gr/api/eshop/CheckBarcodeCubit?itemcode=${ITEMCODE}` },
    { url: `https://www.masoutis.gr/api/eshop/CheckBarcodeCubit?barcode=${ITEMCODE}` },
    { url: `https://www.masoutis.gr/api/eshop/ShowCheckedBarcodeCubit?itemcode=${ITEMCODE}` },
    { url: `https://scanandshopapp.masoutis.gr/wcfMasoutisScanApp/GetItemByBarcode?barcode=${ITEMCODE}` },
  ];
  for (const e of endpoints) {
    const r = await tryUrl(e.url, e.opts || {});
    const short = r.url.replace(/^https?:\/\/[^/]+/, '');
    if (r.error) { console.log(`  ❌ ${short} — ${r.error}`); continue; }
    const tag = r.status === 200 ? '✅' : '❌';
    let note = '';
    if (r.json) {
      const fields = walkForBarcodeFields(r.json);
      if (fields.length) note = ` 🎯 ${fields.map((f) => `${f.path}=${JSON.stringify(f.value)}`).slice(0, 4).join(' ')}`;
      else {
        const h = eanHits(r.text);
        if (h.greek.length) note = ` 🇬🇷 EAN: ${h.greek.slice(0, 4).join(', ')}`;
      }
    }
    console.log(`  ${tag} ${r.status} ${short.slice(0, 70)}${note}`);
    console.log(`     body: ${r.text.slice(0, 500).replace(/\s+/g, ' ')}`);
    await new Promise((res) => setTimeout(res, 300));
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
