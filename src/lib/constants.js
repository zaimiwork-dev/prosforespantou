// `leafletUrl` — the chain's OWN current-leaflet/offers page. Stable URLs (the
// PDF behind them rotates on the chain's side, so the link is always fresh).
// Each verified live 2026-06-12 except ab (this network is Akamai-blocked from
// all of www.ab.gr — it's their standard nav path; verify once from a browser).
export const SUPERMARKETS = [
  { id: "ab", name: "AB Vassilopoulos", short: "AB", color: "#E63946", bg: "#fff0f0", heroLabel: "AB", heroSub: "Vassilopoulos", logo: "ab.png", leafletUrl: "https://www.ab.gr/fylladia" },
  { id: "sklavenitis", name: "Σκλαβενίτης", short: "ΣΚ", color: "#1D3557", bg: "#f0f3ff", heroLabel: "Σκλαβε-", heroSub: "νίτης", logo: "sklavenitis.png", leafletUrl: "https://www.sklavenitis.gr/sylloges/prosfores/" },
  { id: "lidl", name: "Lidl", short: "LI", color: "#0050AA", bg: "#f0f5ff", heroLabel: "Lidl", heroSub: "", logo: "lidl.png", leafletUrl: "https://www.lidl-hellas.gr/l/el/fylladio" },
  { id: "mymarket", name: "My Market", short: "MM", color: "#e07b00", bg: "#fff7ed", heroLabel: "My", heroSub: "Market", logo: "mymarket.jpg", leafletUrl: "https://www.mymarket.gr/offers" },
  { id: "masoutis", name: "Μασούτης", short: "ΜΑ", color: "#2d6a4f", bg: "#f0fff4", heroLabel: "Μασού-", heroSub: "της", logo: "masoutis.png", leafletUrl: "https://www.masoutis.gr/categories/index/fylladio" },
  { id: "bazaar", name: "Bazaar", short: "BZ", color: "#7b2d8b", bg: "#fdf0ff", heroLabel: "Bazaar", heroSub: "", logo: "bazaar.svg", leafletUrl: "https://www.bazaar-online.gr/prosfores" },
  { id: "kritikos", name: "Κρητικός", short: "ΚΡ", color: "#e85d04", bg: "#fff4ed", heroLabel: "Κρητι-", heroSub: "κός", logo: "kritikos.avif", leafletUrl: "https://kritikos-sm.gr/fylladia/" },
  { id: "marketin", name: "Market In", short: "MI", color: "#606c38", bg: "#f4f7ed", heroLabel: "Market", heroSub: "In", logo: "marketin.png", leafletUrl: "https://www.market-in.gr/el-gr/fylladia" },
  { id: "discountmarkt", name: "Discount Markt", short: "DM", color: "#d62828", bg: "#fff0f0", heroLabel: "Discount", heroSub: "Markt", logo: "discount_markt.png" },
  { id: "galaxias", name: "Γαλαξίας", short: "ΓΑ", color: "#003f88", bg: "#eef3ff", heroLabel: "Γαλα-", heroSub: "ξίας", logo: "galaxias.jpg", leafletUrl: "https://galaxias.shop/fylladio" },
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
