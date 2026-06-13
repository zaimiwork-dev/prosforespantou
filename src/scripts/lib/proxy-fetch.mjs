// Residential-proxy support for adapters whose target host IP-blocks datacenter
// ranges (GitHub Actions + Vercel). sklavenitis.gr (Akamai) is the canonical
// case: it 403s every cloud IP but serves residential ones. Setting PROXY_URL in
// CI routes Node's GLOBAL fetch through a residential-looking IP so the daily
// scrape (and its image-mirror downloads from s1.sklavenitis.gr, which is
// blocked the same way) succeed unattended.
//
// Design:
//   - No-op when PROXY_URL is unset → every other chain's fetch is untouched.
//     Only chains that opt in (call installProxyFromEnv at startup) AND run with
//     PROXY_URL set are affected. Masoutis (Vercel cron, not blocked) never sets
//     it, so nothing changes there.
//   - Installs a process-global undici dispatcher, so ALL global fetch in the
//     run is proxied with one call — covers page fetches, chain image downloads,
//     and the Supabase HEAD/upload. The Supabase round-trip riding the proxy is
//     accepted overhead: the image mirror HEAD-skips already-uploaded files, so
//     steady-state runs move only a few genuinely-new images. If proxy bandwidth
//     ever bites, make the mirror's Supabase calls bypass the dispatcher.
//   - The installed `undici` shares Node's global-dispatcher symbol, so
//     setGlobalDispatcher here does affect the built-in global fetch.
//
// PROXY_URL form: http://user:pass@host:port (https:// proxy endpoints also work).

import { ProxyAgent, setGlobalDispatcher } from 'undici';

let installed = false;

// Strip credentials so the URL is safe to log.
function maskProxyUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparseable PROXY_URL)';
  }
}

// Install the global proxy dispatcher if PROXY_URL is set. Idempotent.
// Returns { enabled, url } so callers can log/branch.
export function installProxyFromEnv(env = process.env) {
  const url = (env.PROXY_URL || '').trim();
  if (!url) return { enabled: false, url: null };
  if (installed) return { enabled: true, url };

  setGlobalDispatcher(new ProxyAgent(url));
  installed = true;
  console.log(`   🛡️  proxy enabled via PROXY_URL (${maskProxyUrl(url)})`);
  return { enabled: true, url };
}

// Test seam — reset the module-level guard between unit tests.
export function _resetForTest() {
  installed = false;
}

export { maskProxyUrl };
