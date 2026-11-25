// `leafletUrl` — the chain's OWN φυλλάδιο page (the actual leaflet/flipbook,
// NOT an offers item-listing — user requirement 2026-06-12). Stable URLs; the
// leaflet behind them rotates on the chain's side, so the link is always
// fresh. Each verified live by page title 2026-06-12 except ab (Akamai blocks
// every non-browser fetch — URL from the user; the audit-mappings workflow
// prints its status from CI, the one context that reaches www.ab.gr).
// Watch the odd spellings: kritikos "fulladia/fulladio", marketin "filadio",
// sklavenitis "katalogoi_" (trailing underscore). No leaflet page exists on
// galaxias.shop — no link rather than a wrong one. discountmarkt.gr's is
// /offer-brochures/ (a 3D flipbook of the weekly PDF).
export const SUPERMARKETS = [
  { id: "ab", name: "AB Vassilopoulos", short: "AB", color: "#E63946", bg: "#fff0f0", heroLabel: "AB", heroSub: "Vassilopoulos", logo: "ab.png", leafletUrl: "https://www.ab.gr/promotions/leaflet" },
  { id: "sklavenitis", name: "Σκλαβενίτης", short: "ΣΚ", color: "#1D3557", bg: "#f0f3ff", heroLabel: "Σκλαβε-", heroSub: "νίτης", logo: "sklavenitis.png", leafletUrl: "https://www.sklavenitis.gr/katalogoi_/" },
  { id: "lidl", name: "Lidl", short: "LI", color: "#0050AA", bg: "#f0f5ff", heroLabel: "Lidl", heroSub: "", logo: "lidl.png", leafletUrl: "https://www.lidl-hellas.gr/l/el/fylladio" },
  { id: "mymarket", name: "My Market", short: "MM", color: "#e07b00", bg: "#fff7ed", heroLabel: "My", heroSub: "Market", logo: "mymarket.jpg", leafletUrl: "https://www.mymarket.gr/fylladio-my-market" },
  { id: "masoutis", name: "Μασούτης", short: "ΜΑ", color: "#2d6a4f", bg: "#f0fff4", heroLabel: "Μασού-", heroSub: "της", logo: "masoutis.png", leafletUrl: "https://www.masoutis.gr/promotion" },
  { id: "bazaar", name: "Bazaar", short: "BZ", color: "#7b2d8b", bg: "#fdf0ff", heroLabel: "Bazaar", heroSub: "", logo: "bazaar.svg", leafletUrl: "https://www.bazaar-online.gr/prosfores" },
  // Γαλαξίας back from the parked list 2026-11-23: galaxias.shop is now a real
  // shop (Magento) and adapters/galaxias.mjs feeds its offers + catalogue.
  { id: "galaxias", name: "Γαλαξίας", short: "ΓΑ", color: "#003f88", bg: "#eef3ff", heroLabel: "Γαλα-", heroSub: "ξίας", logo: "galaxias.jpg" },
  // Market In out of the parked list 2026-11-23: www.market-in.gr is a real
  // shop; adapters/marketin.mjs reads its leaflet + web-only offer listings and
  // marketin-catalog.mjs its whole catalogue (lib/marketin-api).
  { id: "marketin", name: "Market In", short: "MI", color: "#606c38", bg: "#f4f7ed", heroLabel: "Market", heroSub: "In", logo: "marketin.png", leafletUrl: "https://www.market-in.gr/filadio/" },
  // Discount Markt out of the parked list 2026-11-25: no shop exists, so Claude
  // agents read its weekly leaflet (src/scripts/discountmarkt-leaflet.mjs,
  // rules in src/scripts/leaflet-reading-rules.md; every price checked against
  // the leaflet's own unit price).
  { id: "discountmarkt", name: "Discount Markt", short: "DM", color: "#d62828", bg: "#fff0f0", heroLabel: "Discount", heroSub: "Markt", logo: "discount_markt.png", leafletUrl: "https://discountmarkt.gr/offer-brochures/" },
  { id: "kritikos", name: "Κρητικός", short: "ΚΡ", color: "#e85d04", bg: "#fff4ed", heroLabel: "Κρητι-", heroSub: "κός", logo: "kritikos.avif", leafletUrl: "https://kritikos-sm.gr/fulladia/fulladio/" },
];

// Parked chains (removed from the user-facing list 2026-07-07 — selecting a
// store with ZERO offers dead-ended users on empty pages). Recon verdicts:
//   marketin      — UNPARKED 2026-11-23 (the 07-07 verdict was wrong: the shop
//                   lists its leaflet offers as products at /el-gr/ALL/1-1)
//   discountmarkt — UNPARKED 2026-11-25: still no shop (WordPress brochure site),
//                   but Claude agents read the weekly leaflet PDF — see above
//   galaxias      — (was: under-construction shell) UNPARKED 2026-11-23, see above
// Move an entry back into SUPERMARKETS only once a real adapter feeds it data.
// e-fresh is the next viable NEW chain (clean JSON API, but barcode-less →
// needs guarded name-matching; hold until the Groq mapping audit is unblocked).
// Chains that no longer exist as a separate shop. Κρητικός: bought by Μασούτης
// (approved May 2026), stores rebranding through end-2026, kritikos-sm.gr
// 301-redirects to masoutis.gr since ~2026-11-16; its 2,710 offers were
// soft-deactivated on 2026-11-22 (owner approved). They stay in SUPERMARKETS so
// old rows still resolve a name and logo, but they are never offered as a store
// to pick, never get a sitemap URL, and their shelf prices are never compared.
export const RETIRED_SUPERMARKET_IDS = new Set(["kritikos"]);
export const ACTIVE_SUPERMARKETS = SUPERMARKETS.filter((s) => !RETIRED_SUPERMARKET_IDS.has(s.id));

export const PARKED_SUPERMARKETS = [];

// `label` is the SHORT form for space-tight chips ("Φρούτα & λαχ."). Anywhere
// with room (listing page titles, active-filter chips) must show the full
// name: categoryFullName(id) — never `label` (user feedback 2026-06-12), and
// never the raw id, which is Title Case.
// Departments. `id` is the value stored in discounts.category and used by the
// categoriser, the chains' native maps, URLs and filters — never change it.
// What people see is `label` (short, for chips) and `full` (headings, pages,
// screen readers), both in Greek sentence case: only the first word starts
// with a capital (owner decision 2026-11-22; Microsoft Greek style guide).
export const CATEGORIES = [
  { id: "all", label: "Όλες", full: "Όλες οι κατηγορίες" },
  { id: "Φρούτα & Λαχανικά", label: "Φρούτα & λαχ.", full: "Φρούτα & λαχανικά" },
  { id: "Κρέας & Ψάρι", label: "Κρέας & ψάρι", full: "Κρέας & ψάρι" },
  { id: "Γαλακτοκομικά & Είδη Ψυγείου", label: "Γαλακτοκομικά", full: "Γαλακτοκομικά & είδη ψυγείου" },
  { id: "Τυριά & Αλλαντικά", label: "Τυριά & αλλαν.", full: "Τυριά & αλλαντικά" },
  { id: "Σαλάτες & Αλοιφές", label: "Σαλάτες & αλοιφές", full: "Σαλάτες & αλοιφές" },
  { id: "Κονσέρβες", label: "Κονσέρβες", full: "Κονσέρβες" },
  { id: "Αρτοποιία", label: "Αρτοποιία", full: "Αρτοποιία" },
  { id: "Κατεψυγμένα", label: "Κατεψυγμένα", full: "Κατεψυγμένα" },
  { id: "Είδη Παντοπωλείου", label: "Παντοπωλείο", full: "Είδη παντοπωλείου" },
  { id: "Πρωινό & Ροφήματα", label: "Πρωινό & καφές", full: "Πρωινό & ροφήματα" },
  { id: "Σνακ & Γλυκά", label: "Σνακ & γλυκά", full: "Σνακ & γλυκά" },
  { id: "Κάβα", label: "Ποτά & κάβα", full: "Ποτά & κάβα" },
  { id: "Προσωπική Φροντίδα", label: "Προσωπική φρ.", full: "Προσωπική φροντίδα" },
  { id: "Βρεφικά Είδη", label: "Βρεφικά είδη", full: "Βρεφικά είδη" },
  { id: "Είδη Καθαρισμού & Σπιτιού", label: "Καθαριστικά", full: "Είδη καθαρισμού & σπιτιού" },
  { id: "Είδη Κατοικιδίων", label: "Κατοικίδια", full: "Είδη κατοικιδίων" },
  { id: "Άλλο", label: "Άλλο", full: "Άλλο" },
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

// The name to SHOW for a stored category id; unknown ids are shown as they are.
export function categoryFullName(id) {
  return CATEGORY_BY_ID.get(id)?.full ?? id ?? '';
}
export function categoryShortName(id) {
  return CATEGORY_BY_ID.get(id)?.label ?? id ?? '';
}

export const CATEGORY_MAP = {
  "fruit": "Φρούτα & Λαχανικά",
  "fruits": "Φρούτα & Λαχανικά",
  "vegetables": "Φρούτα & Λαχανικά",
  "μαναβικο": "Φρούτα & Λαχανικά",
  "φρουτα & λαχανικα": "Φρούτα & Λαχανικά",
  "φρουτα": "Φρούτα & Λαχανικά",
  "λαχανικα": "Φρούτα & Λαχανικά",
  "meat": "Κρέας & Ψάρι",
  "κρεας": "Κρέας & Ψάρι",
  "ψαρι": "Κρέας & Ψάρι",
  "ψαρια": "Κρέας & Ψάρι",
  "dairy": "Γαλακτοκομικά",
  "milk": "Γαλακτοκομικά",
  "γαλακτοκομικα": "Γαλακτοκομικά",
  "τυρια": "Γαλακτοκομικά",
  "γιαουρτια": "Γαλακτοκομικά",
  "frozen": "Κατεψυγμένα",
  "κατεψυγμενα": "Κατεψυγμένα",
  "snacks": "Σνακ & Γλυκά",
  "sweets": "Σνακ & Γλυκά",
  "σνακ & γλυκα": "Σνακ & Γλυκά",
  "σνακ": "Σνακ & Γλυκά",
  "γλυκα": "Σνακ & Γλυκά",
  "cleaning": "Είδη Καθαριότητας",
  "καθαριοτητα": "Είδη Καθαριότητας",
  "ειδη καθαριοτητας": "Είδη Καθαριότητας",
  "personal": "Προσωπική Φροντίδα",
  "προσωπικη φροντιδα": "Προσωπική Φροντίδα",
  "drinks": "Ροφήματα",
  "beverages": "Ροφήματα",
  "ροφηματα": "Ροφήματα",
  "ποτα": "Ροφήματα",
  "bakery": "Αρτοποιία",
  "αρτοποιια": "Αρτοποιία",
  "ψωμι": "Αρτοποιία",
};

export const GREEK_TO_LATIN = [
  ["μπ","b"],["ντ","d"],["γκ","g"],["τσ","ts"],["τζ","tz"],
  ["α","a"],["β","v"],["γ","g"],["δ","d"],["ε","e"],["ζ","z"],
  ["η","i"],["θ","th"],["ι","i"],["κ","k"],["λ","l"],["μ","m"],
  ["ν","n"],["ξ","x"],["ο","o"],["π","p"],["ρ","r"],["σ","s"],
  ["ς","s"],["τ","t"],["υ","y"],["φ","f"],["χ","ch"],["ψ","ps"],["ω","o"],
];

export const GREEKLISH_TO_LATIN = [
  ["mp","b"],["nt","d"],["gk","g"],["th","8"],["ch","x2"],["ps","ps"],
];
