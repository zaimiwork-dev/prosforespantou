// Department categorizer — maps any product to one of the ~17 stable top-level
// departments (the CategoryGrid). The previous per-chain mapping dumped huge
// shares into "Άλλο" (masoutis 99.9%, mymarket 41%) because it relied on each
// chain's native category, which masoutis doesn't expose and which doesn't
// align cross-chain. This works off the PRODUCT NAME (reliable everywhere),
// with the chain's native label as an extra hint, so all chains land in the
// same departments.
//
// Pure + strip-safe so the .mjs ingestion scripts can import it directly (same
// constraint as src/lib/hotness.ts — no enums/namespaces/decorators).
//
// The keyword lists are intentionally editable. To retune, move a term or add
// one; categorize() re-runs on the next write and the backfill script
// (recompute-categories.mjs) re-applies it to existing rows.

// Department ids — MUST match the icon keys in components/CategoryIcon.js and
// the ids in lib/constants.js CATEGORIES.
export const DEPARTMENTS = [
  'Φρούτα & Λαχανικά',
  'Κρέας & Ψάρι',
  'Γαλακτοκομικά & Είδη Ψυγείου',
  'Τυριά & Αλλαντικά',
  'Σαλάτες & Αλοιφές',
  'Κονσέρβες',
  'Αρτοποιία',
  'Κατεψυγμένα',
  'Είδη Παντοπωλείου',
  'Πρωινό & Ροφήματα',
  'Σνακ & Γλυκά',
  'Κάβα',
  'Προσωπική Φροντίδα',
  'Βρεφικά Είδη',
  'Είδη Καθαρισμού & Σπιτιού',
  'Είδη Κατοικιδίων',
  'Άλλο',
] as const;

const DEPT_SET = new Set<string>(DEPARTMENTS);

function normalize(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Ordered keyword rules — FIRST match wins, so list specific departments before
// broad ones (e.g. Κατεψυγμένα/Σνακ before Γαλακτοκομικά; Παντοπωλείο last).
// Terms are accent-stripped lowercase; matched as substrings of name+native.
const RULES: { dept: string; terms: string[] }[] = [
  { dept: 'Βρεφικά Είδη', terms: [
    'βρεφικ', 'πανες', 'πανα ', 'pampers', 'babylino', 'μωρομαντηλ', 'μωρου',
    'βρεφικη', 'baby', 'βρεφικο γαλα', 'κρεμα αλλαγης', 'πιπιλ', 'μπιμπερο', 'babycare',
  ] },
  { dept: 'Είδη Κατοικιδίων', terms: [
    // 'pet' removed — matched "PETit"/"risPET" and the "PET" bottle plastic.
    // Rely on Greek pet words + brands instead.
    // 'γατ' (cat) tightened to declensions — bare 'γατ' matched "μπουΓΑΤσάκια".
    'σκυλ', 'γατα', 'γατε', 'γατο', 'γατω', 'κατοικιδ', 'κροκετ', 'ζωοτροφ', 'σκυλου',
    'τροφη σκυλ', 'τροφη γατ', 'αμμος γατ',
    'whiskas', 'friskies', 'pedigree', 'felix', 'sheba', 'catisfactions',
    'dreamies', 'kitekat', 'royal canin', 'perfect fit', 'purina', 'vitakraft',
  ] },
  { dept: 'Κατεψυγμένα', terms: [
    'κατεψυγ', 'παγωτο', 'καταψυξ', 'frozen', 'κατεψ.', 'φιλετο μπακαλιαρου κατεψ',
    'λαχανικα κατεψ', 'πατατες κατεψ', 'ζυμη σφολιατας', 'ζυμη κουρου',
  ] },
  { dept: 'Τυριά & Αλλαντικά', terms: [
    'τυρι', 'φετα', 'γραβιερα', 'γκουντα', 'gouda', 'εμενταλ', 'emmental', 'κασερι',
    'edam', 'παρμεζαν', 'μοτσαρελ', 'ημισκληρο', 'κεφαλοτυρι', 'μυζηθρα', 'ανθοτυρο',
    'αλλαντ', 'ζαμπον', 'σαλαμι', 'μπεικον', 'bacon', 'λουκανικ', 'παριζ', 'προσουτο',
    'γαλοπουλα φετες', 'πεπερονι', 'μορταδελ',
  ] },
  { dept: 'Κρέας & Ψάρι', terms: [
    'κρεας', 'κιμα', 'κοτοπουλο', 'κοτομπουκ', 'χοιριν', 'μοσχαρ', 'αρνι', 'κατσικ',
    'μπριζολ', 'φιλετο', 'σνιτσελ', 'μπιφτεκ', 'σουβλακ', 'γυρο', 'λουκανικα νωπ',
    'ψαρι', 'ψαρια', 'σολομος', 'salmon', 'γαριδ', 'καλαμαρ', 'χταποδ', 'μπακαλιαρ',
    'τσιπουρα', 'λαβρακ', 'πεστροφ', 'γαλοπουλα νωπ', 'κουνελι', 'συκωτ',
    'θραψαλο', 'γαμπαρ',
  ] },
  { dept: 'Σαλάτες & Αλοιφές', terms: [
    'σαλατα', 'τζατζικ', 'μελιτζανοσαλατ', 'ταραμοσαλατ', 'ταραμα', 'τυροσαλατ',
    'χουμους', 'hummus', 'αλοιφ', 'ντιπ', 'dip', 'πατζαροσαλατ',
  ] },
  { dept: 'Κονσέρβες', terms: [
    'κονσερβ', 'τονος', 'σαρδελ', 'σκουμπρι κονσ', 'πελτε', 'πασσατα', 'passata',
    'τοματα κονσ', 'τοματακι αποφλ', 'αποφλοιωμεν', 'φασολια κονσ', 'καλαμποκι κονσ',
    'αρακας κονσ', 'φασολακια κονσ', 'ντοματα συσκευασ',
    // processed/jarred tomato (AB names them "Τομάτα Τριμμένη/Περαστή/Στον
    // Τρίφτη" — fresh 'ντοματ' keyword never matched the accented "Τομάτα").
    'pummaro', 'τοματα τριμ', 'τοματα ψιλοκομ', 'τοματα περαστ', 'τοματα στον τριφτ',
    'περαστη στο μυλ',
  ] },
  { dept: 'Σνακ & Γλυκά', terms: [
    'σοκολατ', 'chocolate', 'μπισκοτ', 'γκοφρετ', 'wafer', 'τσιπς', 'chips', 'πατατακ',
    'snack', 'σνακ', 'καραμελ', 'τσιχλ', 'γαριδακ', 'κρουτον', 'ποπ κορν', 'popcorn',
    'ξηρους καρπους', 'ξηροι καρποι', 'φιστικ', 'αμυγδαλ', 'καρυδ', 'σταφιδ', 'κρακερ',
    'cracker', 'γλυκο κουταλιου', 'κρουασαν', 'croissant', 'κεικ', 'cake', 'ζελε',
    'λουκουμ', 'μπαρα δημητρ', 'πραλιν', 'νουγκατ', 'γκοφρ', 'kinder', 'ferrero',
    'lacta', 'oreo', 'merenda', 'chocolate', 'σοκολατακ',
  ] },
  { dept: 'Γαλακτοκομικά & Είδη Ψυγείου', terms: [
    'γαλα', 'γιαουρτ', 'yogurt', 'βουτυρο', 'μαργαριν', 'αυγα', 'κρεμα γαλακτος',
    'επιδορπ', 'ρυζογαλο', 'κρεμ καραμελ', 'ζυμη πιτσας', 'φυλλο κρουστας', 'σφολιατ',
    'ανθος αραβοσιτου', 'κρεμα φρεσκια', 'milk', 'ροφημα βρωμης', 'ροφημα σογιας',
  ] },
  { dept: 'Αρτοποιία', terms: [
    'ψωμι', 'αρτος', 'τοστ', 'φρυγανι', 'κριτσιν', 'παξιμαδ', 'τσουρεκ', 'σταρενι',
    'πιτα ', 'πιτες', 'λαγανα', 'ντακος', 'ζυμαρι πιτας', 'αρτιδια', 'ψωμακ',
  ] },
  { dept: 'Φρούτα & Λαχανικά', terms: [
    'φρουτ', 'λαχανικ', 'μηλο', 'μηλα', 'μπανανα', 'πορτοκαλ', 'λεμον', 'μανταριν',
    'ντοματ', 'πατατ', 'κρεμμυδ', 'σκορδ', 'μαρουλ', 'αγγουρ', 'καροτ', 'μπροκολ',
    'κουνουπιδ', 'πιπερι', 'μελιτζαν', 'κολοκυθ', 'σπανακ', 'μαϊνταν', 'ανηθ', 'σελιν',
    'φραουλ', 'σταφυλ', 'αχλαδ', 'ροδακιν', 'βερικοκ', 'πεπον', 'καρπουζ', 'ακτινιδ',
    'αβοκαντο', 'μανιταρ', 'ραπανακ', 'παντζαρ', 'κερασ', 'τοματιν',
  ] },
  { dept: 'Πρωινό & Ροφήματα', terms: [
    'καφε', 'nescafe', 'espresso', 'nespresso', 'καπουτσιν', 'φραπε', 'δημητριακα', 'cornflakes',
    'κουακερ', 'βρωμη', 'μελι', 'μαρμελαδ', 'ταχιν', 'φιστικοβουτυρ', 'τσαι', 'tea',
    'ροφημα κακαο', 'κακαο', 'nesquik', 'στιγμιαιος', 'φακελακια τσαι',
  ] },
  { dept: 'Κάβα', terms: [
    // NOTE: short Latin tokens are space-padded so they match whole words only.
    // Bare substrings caused false hits: 'gin'→"oriGINal", 'rum'→"seRUM",
    // 'tonic'→"isoTONIC", 'νερο'/'νερου'→"ροδόΝΕΡΟ"/"αποσκληρυντικό ΝΕΡΟΥ".
    // 'beer' (→"orzene BEER recipes σαμπουάν") and 'energy' (→"nivea/fa ENERGY
    // boost/gel" cosmetics) are dropped — Greek drinks use μπύρα / explicit
    // "energy drink", so the bare words only cause cosmetic false positives.
    'μπυρα', 'κρασι', 'wine', 'οινος', 'ουζο', 'τσιπουρο', 'βοτκα', 'vodka',
    'ουισκι', 'whisky', 'whiskey', 'gin', 'τζιν', 'ρουμι', 'rum', 'λικερ', 'σαμπανι',
    'αναψυκτικ', 'coca', 'cola', 'pepsi', 'σπριτ', 'sprite', 'fanta', 'χυμο', 'χυμος',
    'εμφιαλωμεν', 'σοδα', 'tonic', 'ενεργειακο ποτο', 'energy drink', 'ice tea',
    'αναψυκτικα', 'μεταλλικο νερο', 'φυσικο νερο', 'επιτραπεζιο νερο', 'monster', 'red bull',
  ] },
  { dept: 'Προσωπική Φροντίδα', terms: [
    'σαμπουαν', 'shampoo', 'αφρολουτρο', 'οδοντοκρεμα', 'οδοντοβουρτσ', 'στοματικο',
    'σαπουν', 'αποσμητικ', 'deo', 'ξυραφ', 'ξυρισμα', 'αφρος ξυρισματος', 'σερβιετ',
    'ταμπον', 'σελφ ταν', 'κρεμα προσωπ', 'κρεμα χεριων', 'κρεμα σωματος', 'μακιγιαζ',
    'κραγιον', 'μασκαρα', 'βαφη μαλλιων', 'conditioner', 'μαλακτικη κρεμα μαλλιων',
    'gel μαλλιων', 'λακ', 'καλλυντικ', 'αντηλιακ', 'μωρομαντηλα', 'βαμβακι',
    'χαρτομαντηλ', 'πανακια ντεμακιγιαζ',
    // common oral-care abbreviation (colgate/aim/sensodyne "ΟΔ/ΜΑ") + brands
    'οδ/μα', 'οδ/κη', 'colgate', 'sensodyne', 'elmex', 'oral-b',
    'l\'oreal', 'loreal', 'garnier', 'nivea', 'pantene', 'syoss', 'palette',
    'schwarzkopf', 'gliss', 'elvive', 'koleston', 'excellence creme', 'diadermine',
    'bioten', 'dove', 'rexona', 'veet', 'tena', 'kotex', 'always', 'tampax',
    'gillette', 'wilkinson', 'κολωνια', 'αρωμα', 'eau de', 'βαφη',
    // English/Latin brands + product words the Greek lists missed (null-native
    // chains: masoutis/sklavenitis/ab name-only). carroten/noxzema=suncare,
    // wellaflex=hairspray, hansaplast=plasters, septona/dermasoft=cotton+wipes.
    'carroten', 'noxzema', 'wellaflex', 'hansaplast', 'septona', 'dermasoft',
    'after shave', 'aftershave', 'old spice', 'wet hankies', 'hankies',
    'cotton buds', 'μπατονετ', 'εσωρουχ',
  ] },
  { dept: 'Είδη Καθαρισμού & Σπιτιού', terms: [
    'απορρυπαντικ', 'πλυντηριου', 'υγρο πιατων', 'σκονη πλυσιματος', 'μαλακτικο ρουχ',
    'χλωριν', 'καθαριστικ', 'καθαρισμου', 'καθαρισμος', 'σφουγγαρι', 'χαρτι κουζινας',
    'χαρτι υγειας', 'χαρτικα', 'αλουμινοχαρτ', 'μεμβραν', 'σακουλες απορ', 'σακουλα σκουπιδ',
    'γαντια', 'εντομοκτον', 'απολυμαντικ', 'γυαλιστικ', 'καθαριστης τζαμιων',
    'υγρα δαπεδου', 'σκουπα', 'αρωματικο χωρου', 'κεριά ', 'λαμπες',
    // brands + abbreviations seen in the data
    'bref', 'sani ', 'zewa', 'χ.υγειας', 'χ. υγειας', 'χ/υγειας', 'ariel', 'skip ',
    'dixan', 'vanish', 'klinex', 'finish', 'calgon', 'ajax', 'cif ', 'wc ', 'pods',
    // laundry colour-catchers / moth+insect / bleach + paper-goods brands the
    // name-only chains expose (χρωμοπαγιδ=colour catcher, λευκαντικ=bleach).
    'χρωμοπαγιδ', 'σκοροκτον', 'λευκαντικ', 'χαρτοπετσετ', 'colour catcher',
    'color catcher', 'catcher', 'raid', 'airwick', 'air wick', 'vapona', 'teza',
    'beckmann', 'fairy', 'k2r', 'softex', 'sanitas',
  ] },
  { dept: 'Είδη Παντοπωλείου', terms: [
    'ελαιολαδο', 'λαδι', 'ηλιελαιο', 'ζυμαρικ', 'μακαρον', 'σπαγγετ', 'πεννες', 'πενες', 'κοφτο',
    'ρυζι', 'αλευρι', 'ζαχαρη', 'αλατι', 'ξυδι', 'σαλτσα', 'κετσαπ', 'μαγιονεζ',
    'μουσταρδα', 'μπαχαρικ', 'οσπρια', 'φακες', 'φασολια', 'ρεβυθ', 'φαβα', 'κους κους',
    'πληγουρι', 'κορν φλαουρ', 'μαγειρικ', 'ζωμος', 'κυβος', 'σος', 'μπεικιν', 'γλυκαντικ',
    // pasta + pantry brands/nouns the name-only chains expose
    'misko', 'knorr', 'penne', 'ταλιατελ', 'φιδες', 'κριθαρακ',
  ] },
];

/**
 * Map a product to one of DEPARTMENTS.
 * @param name      product / deal name (primary signal)
 * @param nativeHint chain's native category label, if any (secondary signal)
 */
// Pure-Latin tokens (single word, a–z/0–9) match on WORD BOUNDARIES so they
// can't fire glued inside a bigger word — the recurring bug class: 'ion'→
// "hydratION", 'pet'→"PETit", 'rum'→"seRUM", 'lacta'→"LACTAcyd", 'cola'→
// "choCOLAte". Greek stems and multi-word/punctuated terms keep substring
// matching, because we deliberately rely on prefixes there ('απορρυπαντικ',
// 'σαμπουαν', 'red bull', "l'oreal").
function buildMatcher(term: string): (text: string) => boolean {
  const t = term.trim();
  if (/^[a-z0-9]+$/.test(t)) {
    const re = new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`);
    return (text) => re.test(text);
  }
  return (text) => text.includes(term);
}

const COMPILED = RULES.map((r) => ({
  dept: r.dept,
  terms: r.terms.map((term) => ({ term, test: buildMatcher(term) })),
}));

// Native-category alias map. Chains expose their own category labels, which are
// a far cleaner signal than guessing from the product name — so when a row
// carries one of these EXACT native labels we map it straight to a department,
// BEFORE any keyword matching. This both rescues "Άλλο" rows the name couldn't
// place AND corrects name-keyword misfires (the dairy 'γαλα' stem was eating
// "Γαλάκτωμα"/"Body Milk" body-lotions; the cleaning 'καθαρισμ' stem was eating
// "Καθαρισμός Προσώπου" face-cleansers; denture care landed in Αρτοποιία).
//
// Only UNAMBIGUOUS labels belong here. Polysemous ones whose meaning flips by
// chain/context — Λευκά (white wine? cheese?), Υγρό, Ενηλίκων, Pants, Γεμιστά,
// Multipack, Σε Φέτες, Διάφορες Γεύσεις — are deliberately left out so they
// fall through to keyword matching on the product name.
//
// Keys are matched accent-insensitively (normalize()); write them verbatim as
// the chain emits them. To retune: move a label, then re-run
// recompute-categories.mjs. Audit with audit-categories.mjs.
const NATIVE_ALIASES_RAW: Record<string, string> = {
  // Προσωπική Φροντίδα
  'Βαφές': 'Προσωπική Φροντίδα',
  'Αφρόλουτρα': 'Προσωπική Φροντίδα',
  'Αφρόλουτρα, Αφροντούς': 'Προσωπική Φροντίδα',
  'Καθαρισμός Προσώπου': 'Προσωπική Φροντίδα',
  'Κρέμες Προσώπου': 'Προσωπική Φροντίδα',
  'Κρέμες': 'Προσωπική Φροντίδα',
  'Κρέμες Χεριών': 'Προσωπική Φροντίδα',
  'Hair Spray': 'Προσωπική Φροντίδα',
  'Μάσκες': 'Προσωπική Φροντίδα',
  'After Shave, Κρέμες Ενυδάτωσης': 'Προσωπική Φροντίδα',
  'Γαλάκτωμα': 'Προσωπική Φροντίδα',
  'Γαλακτώματα, Κρέμες': 'Προσωπική Φροντίδα',
  'Body Milk / Lotions': 'Προσωπική Φροντίδα',
  'Τεχνητή Οδοντοστοιχία': 'Προσωπική Φροντίδα',
  'Τεχνητή Οδοντοστοιχεία': 'Προσωπική Φροντίδα',
  // Hair/face oils & serums — the 'λαδι' (cooking-oil) keyword was dragging
  // these whole native sections into Παντοπωλείου.
  'Λάδια, Serum, Θεραπείες': 'Προσωπική Φροντίδα',
  'Λάδι / Μάσκα': 'Προσωπική Φροντίδα',
  'Λάδι / Πούδρα': 'Προσωπική Φροντίδα',
  // Κάβα
  'Lager': 'Κάβα',
  'Pils': 'Κάβα',
  'Stout': 'Κάβα',
  'Ale': 'Κάβα',
  'Weiss': 'Κάβα',
  'Ενεργειακά': 'Κάβα',
  'Ερυθρά': 'Κάβα',
  'Ροζέ': 'Κάβα',
  'Γκαζόζα': 'Κάβα',
  'Liqueur, Aperitif': 'Κάβα',
  'Απεριτίφ': 'Κάβα',
  'Τεκίλα': 'Κάβα',
  'Ανθρακούχα Νερά': 'Κάβα',
  'Ανθρακούχο': 'Κάβα',
  'Μηλίτης': 'Κάβα',
  'Αφρώδεις Οίνοι': 'Κάβα',
  'Χωρίς Αλκοόλ': 'Κάβα',
  'Alcohol Free': 'Κάβα',
  'Μη Αλκοολούχα': 'Κάβα',
  // Κατεψυγμένα
  'Παγωτά': 'Κατεψυγμένα',
  // Είδη Καθαρισμού & Σπιτιού
  'Υγρά Πιάτων': 'Είδη Καθαρισμού & Σπιτιού',
  'Σκοροκτόνα': 'Είδη Καθαρισμού & Σπιτιού',
  'Κατσαριδοκτόνα': 'Είδη Καθαρισμού & Σπιτιού',
  'Εντομοαπωθητικά': 'Είδη Καθαρισμού & Σπιτιού',
  'Εντομ/Τικα / Λοσιόν': 'Είδη Καθαρισμού & Σπιτιού',
  'Ενισχυτικά Πλύσης, Σιδέρωμα': 'Είδη Καθαρισμού & Σπιτιού',
  'Ενισχυτικά - Χρωμοπαγιδες': 'Είδη Καθαρισμού & Σπιτιού',
  'Υγρά Ταμπλέτες': 'Είδη Καθαρισμού & Σπιτιού',
  'Ταμπλέτες': 'Είδη Καθαρισμού & Σπιτιού',
  'Χαρτοπετσέτες': 'Είδη Καθαρισμού & Σπιτιού',
  'Σφουγγαράκια, Συρματάκια': 'Είδη Καθαρισμού & Σπιτιού',
  'Σπογγοπετσέτες': 'Είδη Καθαρισμού & Σπιτιού',
  'Σύρματα': 'Είδη Καθαρισμού & Σπιτιού',
  'Σακούλες Σκουπιδιών': 'Είδη Καθαρισμού & Σπιτιού',
  'Σακούλες Τροφίμων': 'Είδη Καθαρισμού & Σπιτιού',
  'Αποσκληρυντικό': 'Είδη Καθαρισμού & Σπιτιού',
  'Αποσκληρυντικά': 'Είδη Καθαρισμού & Σπιτιού',
  'Για το Μπάνιο': 'Είδη Καθαρισμού & Σπιτιού',
  'Κουζίνας': 'Είδη Καθαρισμού & Σπιτιού',
  'Κουζίνας, Λιποκαθαριστές': 'Είδη Καθαρισμού & Σπιτιού',
  'Πατώματος, Παρκέ': 'Είδη Καθαρισμού & Σπιτιού',
  'Γενικής Χρήσης': 'Είδη Καθαρισμού & Σπιτιού',
  'Φαράσια': 'Είδη Καθαρισμού & Σπιτιού',
  'Κοντάρια': 'Είδη Καθαρισμού & Σπιτιού',
  'Τζάμια': 'Είδη Καθαρισμού & Σπιτιού',
  'Τζαμιών': 'Είδη Καθαρισμού & Σπιτιού',
  'Σπιράλ / Κεριά': 'Είδη Καθαρισμού & Σπιτιού',
  'Παγίδες': 'Είδη Καθαρισμού & Σπιτιού',
  'Αποφρακτικά': 'Είδη Καθαρισμού & Σπιτιού',
  'Κατά των Αλάτων': 'Είδη Καθαρισμού & Σπιτιού',
  'Πλύσιμο Στο Χέρι': 'Είδη Καθαρισμού & Σπιτιού',
  'Σκόνη': 'Είδη Καθαρισμού & Σπιτιού',
  'Αρωματικά Χώρου, Κεριά': 'Είδη Καθαρισμού & Σπιτιού',
  // Βρεφικά Είδη
  'Περιποίηση Σώματος Βρέφους': 'Βρεφικά Είδη',
  'Φροντίδα Μαλλιών Βρέφους': 'Βρεφικά Είδη',
  // Είδη Παντοπωλείου
  'Άλλες Πάστες': 'Είδη Παντοπωλείου',
  'Κριθαράκι': 'Είδη Παντοπωλείου',
  'Αραβοσιτέλαιο': 'Είδη Παντοπωλείου',
  'Σπορέλαιο': 'Είδη Παντοπωλείου',
  'Πυρηνέλαιο': 'Είδη Παντοπωλείου',
  'Στέβια': 'Είδη Παντοπωλείου',
  'Κύβοι, Ζωμοί': 'Είδη Παντοπωλείου',
  'Ζωμοί Ψυγείου': 'Είδη Παντοπωλείου',
  'Για Σαλάτες': 'Είδη Παντοπωλείου',
  // Σνακ & Γλυκά
  'Μπάρες Δημητριακών': 'Σνακ & Γλυκά',
  'Μπάρες': 'Σνακ & Γλυκά',
  'Nachos': 'Σνακ & Γλυκά',
  'Digestive': 'Σνακ & Γλυκά',
  'Χαλβάς, Παστέλια, Μαντολάτα': 'Σνακ & Γλυκά',
  'Βουτήματα': 'Σνακ & Γλυκά',
  'Κουβερτούρα': 'Σνακ & Γλυκά',
  'Φυστικοβούτυρο': 'Σνακ & Γλυκά',
  // Γαλακτοκομικά & Είδη Ψυγείου
  'Φυτικά Ροφήματα': 'Γαλακτοκομικά & Είδη Ψυγείου',
  'Βούτυρα': 'Γαλακτοκομικά & Είδη Ψυγείου',
  // Πρωινό & Ροφήματα
  'Κάψουλες': 'Πρωινό & Ροφήματα',
  'Ελληνικός': 'Πρωινό & Ροφήματα',
  // Τυριά & Αλλαντικά
  'Τριμμένα': 'Τυριά & Αλλαντικά',
  'Κρεμώδη': 'Τυριά & Αλλαντικά',
  // Κρέας & Ψάρι
  'Βοδινό': 'Κρέας & Ψάρι',
  // Κονσέρβες
  'Τοματοειδή': 'Κονσέρβες',
};

// Normalized lookup (accent-stripped lowercase keys), built once at load.
const NATIVE_ALIASES = new Map<string, string>();
for (const [label, dept] of Object.entries(NATIVE_ALIASES_RAW)) {
  NATIVE_ALIASES.set(normalize(label), dept);
}

function matchRules(text: string): string | null {
  for (const rule of COMPILED) {
    if (rule.terms.some((tt) => tt.test(text))) return rule.dept;
  }
  return null;
}

// Diagnostic mirror of categorize() that also reports HOW the decision was made
// (which department, via native-department / native-keyword / name-keyword, and
// the exact term). Used by the category audit script to hunt substring leaks.
export function categorizeTrace(name: string | null | undefined, nativeHint?: string | null) {
  if (nativeHint && nativeHint !== 'Άλλο' && DEPT_SET.has(nativeHint)) {
    return { dept: nativeHint, via: 'native-dept', term: null as string | null };
  }
  if (nativeHint && nativeHint !== 'Άλλο') {
    const alias = NATIVE_ALIASES.get(normalize(nativeHint));
    if (alias) return { dept: alias, via: 'native-alias', term: nativeHint };
    const n = normalize(nativeHint);
    for (const r of COMPILED) { const tt = r.terms.find((x) => x.test(n)); if (tt) return { dept: r.dept, via: 'native-kw', term: tt.term }; }
  }
  const nm = normalize(name);
  for (const r of COMPILED) { const tt = r.terms.find((x) => x.test(nm)); if (tt) return { dept: r.dept, via: 'name', term: tt.term }; }
  return { dept: 'Άλλο', via: 'none', term: null as string | null };
}

export function categorize(name: string | null | undefined, nativeHint?: string | null): string {
  // 1. Trust an upstream label that is already a real department (LLM resolver
  //    for sklavenitis/AB, admin-entered) — but not "Άλλο" (= "unknown").
  if (nativeHint && nativeHint !== 'Άλλο' && DEPT_SET.has(nativeHint)) return nativeHint;

  // 2. Exact native-label alias (NATIVE_ALIASES) — highest-precision signal:
  //    the chain's own taxonomy mapped straight to a department, ahead of any
  //    keyword guessing. Catches both unplaceable "Άλλο" labels and labels the
  //    name keywords would misfile (e.g. "Γαλάκτωμα" body-lotion → dairy).
  if (nativeHint && nativeHint !== 'Άλλο') {
    const alias = NATIVE_ALIASES.get(normalize(nativeHint));
    if (alias) return alias;
  }

  // 3. A granular native label (kritikos "Κρεμοσάπουνα", "Με Βάση Καφέ", …) is
  //    a cleaner signal than the product name, where scent/flavour words mislead
  //    ("ΜΕΛΙ ΓΑΛΑ" soap is not dairy). Match it first when present.
  if (nativeHint && nativeHint !== 'Άλλο') {
    const byNative = matchRules(normalize(nativeHint));
    if (byNative) return byNative;
  }

  // 4. Fall back to the product name.
  return matchRules(normalize(name)) ?? 'Άλλο';
}
