// AB Vasilopoulos persisted-query hash discovery.
//
// WHY THIS EXISTS
// ab.gr's API only accepts Apollo *persisted* queries: the client sends a
// SHA-256 that identifies a query the server already knows, never the query
// text. That hash is baked into AB's frontend build, so every AB redeploy can
// rotate it. When it does, the API answers `PersistedQueryNotFound` and our
// adapter dies.
//
// That is not hypothetical. The hash rotated around 2026-08-02 and the daily
// ab-offers job failed every night for five weeks, taking the chain from ~255
// live offers down to 1 while the pipeline watchdog stayed green. Recovery was
// documented as "re-run probe-ab-offers-capture.mjs by hand and edit the
// PQ_HASH constant" — a manual step nobody was there to perform.
//
// The APQ escape hatch (send the full query text alongside the hash so the
// server registers it) is NOT available to us: the frontend never transmits
// the query text, so our captures don't contain it either. The only durable
// recovery is to read the current hash back out of AB's own JS bundles, which
// is what this module does.
//
// Discovery is deliberately kept in one place, with the adapter and the
// catalog script both importing PQ_HASH from here, because they previously
// carried duplicate copies of the constant that could drift apart.

// The last hash known to work (captured 2026-05-25, still serving until the
// 2026-08 rotation). Used as the first attempt; discovery only runs when the
// API rejects it, so the happy path costs nothing.
export const KNOWN_PQ_HASH = '1c53d86bec1b38b5767f39df2af0949e3bb90ce2a0afa177829d93cf26905800';

export const AB_ORIGIN = 'https://www.ab.gr';
// The page whose bundle graph contains the ProductList operation.
export const AB_PROMOTIONS_PAGE = `${AB_ORIGIN}/search/promotions`;

const HEX64 = /[0-9a-f]{64}/g;

// Pull <script src> and Next.js chunk paths out of an HTML document.
export function extractScriptUrls(html, origin = AB_ORIGIN) {
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  // Next.js also lists chunks inside __NEXT_DATA__ / preload hints.
  for (const m of html.matchAll(/["'](\/_next\/static\/[^"']+\.js)["']/g)) {
    urls.add(m[1]);
  }
  return [...urls]
    .filter((u) => u.endsWith('.js') || u.includes('.js?'))
    .map((u) => (u.startsWith('http') ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`));
}

// Find 64-hex strings that sit near an operation name inside bundle source.
// Apollo builds emit these as a name→hash map, but the exact shape differs by
// bundler and version, so match on proximity and report context rather than
// assuming a single syntax.
export function findHashesNear(source, operationName, window = 400) {
  const hits = [];
  let idx = 0;
  while ((idx = source.indexOf(operationName, idx)) !== -1) {
    const from = Math.max(0, idx - window);
    const slice = source.slice(from, idx + window);
    for (const m of slice.matchAll(HEX64)) {
      hits.push({
        hash: m[0],
        distance: Math.abs(from + m.index - idx),
        context: slice.slice(Math.max(0, m.index - 60), m.index + 100).replace(/\s+/g, ' '),
      });
    }
    idx += operationName.length;
  }
  // Closest occurrence wins; dedupe by hash keeping the best distance.
  const best = new Map();
  for (const h of hits) {
    const prev = best.get(h.hash);
    if (!prev || h.distance < prev.distance) best.set(h.hash, h);
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}

// Enumerate every chunk in a Next.js build, not just the ones referenced by the
// initial HTML. A client-side route's chunk is lazy-loaded, so the operation we
// want can live in a file the promotions page never lists inline — which is
// exactly what the first CI probe hit (27 scripts scanned, 0 mentions).
export async function listBuildManifestChunks({ html, fetchImpl = fetch, headers = {}, origin = AB_ORIGIN }) {
  const buildId = html.match(/"buildId"\s*:\s*"([^"]+)"/)?.[1]
    ?? html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
  if (!buildId) return { buildId: null, chunks: [] };
  const urls = [
    `${origin}/_next/static/${buildId}/_buildManifest.js`,
    `${origin}/_next/static/${buildId}/_app-build-manifest.json`,
  ];
  const chunks = new Set();
  for (const u of urls) {
    try {
      const r = await fetchImpl(u, { headers });
      if (!r.ok) continue;
      const text = await r.text();
      for (const m of text.matchAll(/["'](static\/[^"']+\.js|\/_next\/static\/[^"']+\.js)["']/g)) {
        const path = m[1].startsWith('/') ? m[1] : `/_next/${m[1]}`;
        chunks.add(`${origin}${path}`);
      }
    } catch { /* manifest shape varies by Next version; try the next one */ }
  }
  return { buildId, chunks: [...chunks] };
}

// Reconnaissance: which bundles mention the operation at all, and what markers
// sit around it? Used to work out HOW the hash is produced before assuming a
// shape. Returns per-bundle marker hits plus context snippets.
export async function reconOperation({
  operationName = 'ProductList',
  fetchImpl = fetch,
  headers = {},
  log = () => {},
  maxBundles = 400,
} = {}) {
  const pageRes = await fetchImpl(AB_PROMOTIONS_PAGE, { headers });
  if (!pageRes.ok) throw new Error(`promotions page HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  const inline = extractScriptUrls(html);
  const { buildId, chunks } = await listBuildManifestChunks({ html, fetchImpl, headers });
  const all = [...new Set([...inline, ...chunks])];
  log(`buildId=${buildId ?? 'unknown'} · ${inline.length} inline script(s) · ${chunks.length} manifest chunk(s) · ${all.length} unique`);

  const MARKERS = [operationName, 'persistedQuery', 'sha256', 'PROMOTION_SEARCH', `query ${operationName}`, 'kind:"Document"', 'documentId'];
  const findings = [];
  let scanned = 0;
  for (const url of all.slice(0, maxBundles)) {
    let src;
    try {
      const r = await fetchImpl(url, { headers });
      if (!r.ok) continue;
      src = await r.text();
    } catch { continue; }
    scanned += 1;
    const hits = MARKERS.filter((m) => src.includes(m));
    if (!hits.length) continue;
    const snippets = [];
    if (src.includes(operationName)) {
      const i = src.indexOf(operationName);
      snippets.push(src.slice(Math.max(0, i - 220), i + 320).replace(/\s+/g, ' '));
    }
    findings.push({ url, size: src.length, hits, snippets });
  }
  log(`scanned ${scanned} bundle(s), ${findings.length} with at least one marker`);
  return { buildId, scanned, total: all.length, findings };
}

// Walk AB's frontend and return ranked hash candidates for `operationName`.
// `fetchImpl` is injected so callers can supply a proxy-aware fetch, and so
// this is testable without network access.
export async function discoverPersistedQueryHash({
  operationName = 'ProductList',
  fetchImpl = fetch,
  log = () => {},
  maxBundles = 40,
  headers = {},
} = {}) {
  log(`discovery: fetching ${AB_PROMOTIONS_PAGE}`);
  const pageRes = await fetchImpl(AB_PROMOTIONS_PAGE, { headers });
  if (!pageRes.ok) throw new Error(`promotions page HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  const scripts = extractScriptUrls(html);
  log(`discovery: ${scripts.length} script url(s) found`);

  // A hash present in the page HTML itself is the cheapest possible win.
  const inline = findHashesNear(html, operationName);
  if (inline.length) log(`discovery: ${inline.length} candidate(s) inline in the HTML`);

  const candidates = [...inline];
  let scanned = 0;
  for (const url of scripts.slice(0, maxBundles)) {
    let src;
    try {
      const r = await fetchImpl(url, { headers });
      if (!r.ok) continue;
      src = await r.text();
    } catch {
      continue;
    }
    scanned += 1;
    if (!src.includes(operationName)) continue;
    const found = findHashesNear(src, operationName);
    if (found.length) {
      log(`discovery: ${found.length} candidate(s) in ${url.split('/').pop()}`);
      for (const f of found) candidates.push({ ...f, source: url });
    }
  }
  log(`discovery: scanned ${scanned} bundle(s), ${candidates.length} candidate(s) total`);

  const ranked = [...new Map(candidates.map((c) => [c.hash, c])).values()]
    .sort((a, b) => a.distance - b.distance);
  return ranked;
}

// Confirm a candidate actually answers, so we never adopt a hash for the wrong
// operation. Returns true when the API responds without PersistedQueryNotFound.
export async function verifyHash({ hash, buildUrl, fetchImpl = fetch, headers = {} }) {
  const res = await fetchImpl(buildUrl(hash), { headers });
  if (!res.ok) return false;
  let j;
  try { j = await res.json(); } catch { return false; }
  if (j.errors?.some((e) => /PersistedQueryNotFound/i.test(e.message || ''))) return false;
  return !j.errors;
}
