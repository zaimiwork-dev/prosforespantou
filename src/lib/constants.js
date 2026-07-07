// `leafletUrl` — the chain's OWN φυλλάδιο page (the actual leaflet/flipbook,
// NOT an offers item-listing — user requirement 2026-06-12). Stable URLs; the
// leaflet behind them rotates on the chain's side, so the link is always
// fresh. Each verified live by page title 2026-06-12 except ab (Akamai blocks
// every non-browser fetch — URL from the user; the audit-mappings workflow
// prints its status from CI, the one context that reaches www.ab.gr).
// Watch the odd spellings: kritikos "fulladia/fulladio", marketin "filadio",
// sklavenitis "katalogoi_" (trailing underscore). No leaflet page exists on
// galaxias.shop or discountmarkt.gr — no link rather than a wrong one.
export const SUPERMARKETS = [
  { id: "ab", name: "AB Vassilopoulos", short: "AB", color: "#E63946", bg: "#fff0f0", heroLabel: "AB", heroSub: "Vassilopoulos", logo: "ab.png", leafletUrl: "https://www.ab.gr/promotions/leaflet" },
  { id: "sklavenitis", name: "Σκλαβενίτης", short: "ΣΚ", color: "#1D3557", bg: "#f0f3ff", heroLabel: "Σκλαβε-", heroSub: "νίτης", logo: "sklavenitis.png", leafletUrl: "https://www.sklavenitis.gr/katalogoi_/" },
  { id: "lidl", name: "Lidl", short: "LI", color: "#0050AA", bg: "#f0f5ff", heroLabel: "Lidl", heroSub: "", logo: "lidl.png", leafletUrl: "https://www.lidl-hellas.gr/l/el/fylladio" },
  { id: "mymarket", name: "My Market", short: "MM", color: "#e07b00", bg: "#fff7ed", heroLabel: "My", heroSub: "Market", logo: "mymarket.jpg", leafletUrl: "https://www.mymarket.gr/fylladio-my-market" },
  { id: "masoutis", name: "Μασούτης", short: "ΜΑ", color: "#2d6a4f", bg: "#f0fff4", heroLabel: "Μασού-", heroSub: "της", logo: "masoutis.png", leafletUrl: "https://www.masoutis.gr/promotion" },
  { id: "bazaar", name: "Bazaar", short: "BZ", color: "#7b2d8b", bg: "#fdf0ff", heroLabel: "Bazaar", heroSub: "", logo: "bazaar.svg", leafletUrl: "https://www.bazaar-online.gr/prosfores" },
  { id: "kritikos", name: "Κρητικός", short: "ΚΡ", color: "#e85d04", bg: "#fff4ed", heroLabel: "Κρητι-", heroSub: "κός", logo: "kritikos.avif", leafletUrl: "https://kritikos-sm.gr/fulladia/fulladio/" },
];

// Parked chains (removed from the user-facing list 2026-07-07 — selecting a
// store with ZERO offers dead-ended users on empty pages). Recon verdicts:
//   marketin      — no scrapable offers source (ASP.NET, flipbook-only leaflet)
//   discountmarkt — WordPress brochure site; PDF leaflet viewer, no product data
//   galaxias      — site is an under-construction shell (brand folded into the
//                   My Market group)
// Move an entry back into SUPERMARKETS only once a real adapter feeds it data.
// e-fresh is the next viable NEW chain (clean JSON API, but barcode-less →
// needs guarded name-matching; hold until the Groq mapping audit is unblocked).
export const PARKED_SUPERMARKETS = [
  { id: "marketin", name: "Market In", short: "MI", color: "#606c38", bg: "#f4f7ed", heroLabel: "Market", heroSub: "In", logo: "marketin.png", leafletUrl: "https://www.market-in.gr/filadio/" },
  { id: "discountmarkt", name: "Discount Markt", short: "DM", color: "#d62828", bg: "#fff0f0", heroLabel: "Discount", heroSub: "Markt", logo: "discount_markt.png" },
  { id: "galaxias", name: "Γαλαξίας", short: "ΓΑ", color: "#003f88", bg: "#eef3ff", heroLabel: "Γαλα-", heroSub: "ξίας", logo: "galaxias.jpg" },
];

// `label` is the SHORT form for space-tight chips ("Φρούτα & Λαχ."). Anywhere
// with room (listing page titles, active-filter chips) must show the full
// name: use `full ?? id` — never `label` (user feedback 2026-06-12).
export const CATEGORIES = [
  { id: "all", label: "Όλες" },
  { id: "Φρούτα & Λαχανικά", label: "Φρούτα & Λαχ." },
  { id: "Κρέας & Ψάρι", label: "Κρέας & Ψάρι" },
  { id: "Γαλακτοκομικά & Είδη Ψυγείου", label: "Γαλακτοκομικά" },
  { id: "Τυριά & Αλλαντικά", label: "Τυριά & Αλλαν." },
  { id: "Σαλάτες & Αλοιφές", label: "Σαλάτες & Αλοιφές" },
  { id: "Κονσέρβες", label: "Κονσέρβες" },
  { id: "Αρτοποιία", label: "Αρτοποιία" },
  { id: "Κατεψυγμένα", label: "Κατεψυγμένα" },
  { id: "Είδη Παντοπωλείου", label: "Παντοπωλείο" },
  { id: "Πρωινό & Ροφήματα", label: "Πρωινό & Καφές" },
  { id: "Σνακ & Γλυκά", label: "Σνακ & Γλυκά" },
  { id: "Κάβα", label: "Ποτά & Κάβα", full: "Ποτά & Κάβα" },
  { id: "Προσωπική Φροντίδα", label: "Προσωπική Φρ." },
  { id: "Βρεφικά Είδη", label: "Βρεφικά Είδη" },
  { id: "Είδη Καθαρισμού & Σπιτιού", label: "Καθαριστικά" },
  { id: "Είδη Κατοικιδίων", label: "Κατοικίδια" },
  { id: "Άλλο", label: "Άλλο" },
];

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
