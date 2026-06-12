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

// Explicit .ts extension: the .mjs ingestion scripts import categories.ts
// straight into Node (strip-types), where extensionless ESM imports fail.
import { CHAIN_NATIVE_MAPS } from './native-category-maps.ts';

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
  // HIGHEST priority: laundry / paper / home terms that other rules' broader
  // words would otherwise eat — 'baby' ("Αρκάδι Baby απορρυπαντικό"), 'αρωμα'
  // ("ενισχυτικό αρώματος ρούχων", "αρωματικό χώρου"), 'σαπουν' ("πράσινο
  // σαπούνι πλυντηρίου"). The big historical leak: the personal-care 'λακ'
  // (hairspray) substring ate every "μαΛΑΚτικό"/"ανταΛΑΚτικό" — 381 rows.
  { dept: 'Είδη Καθαρισμού & Σπιτιού', terms: [
    // 'μαλακτικο' masculine = fabric softener; hair conditioner is feminine
    // ("μαλακτική κρέμα") and stays in Προσωπική Φροντίδα.
    'απορρυπαντικ', 'μαλακτικο', 'μαλ/κο', 'συμπ.μαλ', 'απολυμαντικ',
    'ενισχυτικο αρωματος', 'υφασματων', 'αρωματικο χωρου', 'αποσμητικο χωρου',
    'χαρτομαντηλ', 'χαρτ/λα', 'zewa', 'αποχνουδωτ', 'κονταρι', 'κουβας', 'στιφτη',
    'soupline', 'cajoline', 'lenor', 'silan', 'scotch-brite', 'scotch brite',
    // disposable tableware — "Ποτήρι Νερού/Αναψυκτικού 50 Τεμάχια" was landing
    // in Κάβα via 'αναψυκτικ'. NOT bare 'μιας χρησης' — disposable RAZORS
    // ("Ξυραφάκια Μιας Χρήσης") are personal care.
    'ποτηρι νερου', 'ποτηρι αναψυκτικ', 'ποτηρια μιας χρησης', 'πιατα χαρτινα',
    'χαρτινες θηκες', 'συλλεκτης υγρασιας',
  ] },
  // Adult incontinence must beat the Βρεφικά 'πανες' keyword.
  { dept: 'Προσωπική Φροντίδα', terms: ['ακρατειας', 'tena'] },
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
  // Μπάρμπα Στάθης is in the frozen-brand list below, but its bagged FRESH
  // salads (Δροσάτη/Ιταλική) must not freeze with it.
  { dept: 'Σαλάτες & Αλοιφές', terms: ['σταθης σαλατα', 'σαλατα δροσατη'] },
  { dept: 'Κατεψυγμένα', terms: [
    // 'κτψ' = kritikos' frozen abbreviation, on ~every frozen item it sells.
    'κατεψυγ', 'παγωτο', 'καταψυξ', 'frozen', 'κατεψ.', 'κτψ', 'φιλετο μπακαλιαρου κατεψ',
    'λαχανικα κατεψ', 'πατατες κατεψ', 'ζυμη σφολιατας', 'ζυμη κουρου',
    // frozen-only brands/lines whose names rarely say "κατεψυγμένο" — without
    // these, masoutis' name-only rows let frozen spinach/fries read as fresh
    // produce ('σπανακ'/'πατατ').
    'μπαρμπα σταθης', 'μπ.σταθης', 'ας μαγειρεψουμε', 'mccain', 'natural cool',
    'spring rolls', '=noon',
    // Λαζαρίδη = frozen-veg brand; ΣΠΙΤΙΚΕΣ ΕΠΙΛΟΓΕΣ = kritikos ready-meal
    // line (its 'Έτοιμα γεύματα' label is ambiguous — FRUTAPURA fruit cups
    // share it — so the brand decides).
    'λαζαριδη', 'σπιτικες επιλογες',
  ] },
  // Must outrank Τυριά/Κρέας: flavour names carry 'μπέικον'/'τυρί'/'σκόρδο'.
  { dept: 'Σνακ & Γλυκά', terms: ['bake rolls'] },
  { dept: 'Τυριά & Αλλαντικά', terms: [
    'τυρι', 'φετα', 'γραβιερα', 'γκουντα', 'gouda', 'εμενταλ', 'emmental', 'κασερι',
    'edam', 'παρμεζαν', 'μοτσαρελ', 'ημισκληρο', 'κεφαλοτυρι', 'μυζηθρα', 'ανθοτυρο',
    'αλλαντ', 'ζαμπον', 'σαλαμι', 'μπεικον', 'bacon', 'λουκανικ', 'παριζ', 'προσουτο',
    'γαλοπουλα φετες', 'πεπερονι', 'μορταδελ',
    // cheese brands whose names carry no cheese word ("Dirollo Classic Σε
    // Φέτες", "Babybel Mini Rolls", "Ήπειρος Τριγωνάκια"). NOT 'adoro' — the
    // brand also sells butter/cream which belong to Γαλακτοκομικά.
    'dirollo', 'babybel', 'milner', 'la vache', 'ηπειρος',
    'γαλοπουλα καπνιστ', 'γαλοπουλα βραστ',
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
    // tomato juice is a cooking ingredient, not a beverage — must beat the
    // juice rule ('χυμο') which used to drop it in Κάβα.
    'χυμος ντοματας', 'χυμο ντοματας', 'τοματοχυμ', 'ντοματοχυμ', 'χυμος τοματας',
    'τοματα κονσ', 'τοματακι αποφλ', 'αποφλοιωμεν', 'φασολια κονσ', 'καλαμποκι κονσ',
    'αρακας κονσ', 'φασολακια κονσ', 'ντοματα συσκευασ',
    // processed/jarred tomato (AB names them "Τομάτα Τριμμένη/Περαστή/Στον
    // Τρίφτη" — fresh 'ντοματ' keyword never matched the accented "Τομάτα").
    'pummaro', 'τοματα τριμ', 'τοματα ψιλοκομ', 'τοματα περαστ', 'τοματα στον τριφτ',
    'περαστη στο μυλ', 'ψιλοκομμενες τοματες', 'τριμμενες τοματες',
  ] },
  // Προσωπική Φροντίδα runs BEFORE the food departments: cosmetics are full of
  // food scent-words ("αφρόλουτρο Μέλι", "wipes Πράσινο Μήλο", "κρεμοσάπουνο
  // Γάλα Αμυγδάλου") and the product-type words (σαμπουάν/αφρόλουτρο/σαπουν/
  // wipes brands) are far stronger signals than the scents.
  { dept: 'Προσωπική Φροντίδα', terms: [
    'σαμπουαν', 'shampoo', 'αφρολουτρο', 'οδοντοκρεμα', 'οδοντοβουρτσ', 'στοματικο',
    'σαπουν', 'αποσμητικ', 'deo', 'ξυραφ', 'ξυρισμα', 'ξυριστικ', 'αφρος ξυρισματος', 'σερβιετ',
    'ταμπον', 'σελφ ταν', 'κρεμα προσωπ', 'κρεμα χεριων', 'κρεμα σωματος', 'γαλακτωμα σωματος', 'μακιγιαζ',
    'κραγιον', 'μασκαρα', 'βαφη μαλλιων', 'conditioner', 'μαλακτικη κρεμα μαλλιων',
    // '=λακ' boundary-matched: the bare substring ate every "μαΛΑΚτικό" and
    // "ανταΛΑΚτικό" (381 rows). 'χαρτομαντηλ' moved to the home/paper rule.
    'gel μαλλιων', '=λακ', 'taft', 'καλλυντικ', 'αντηλιακ', 'μωρομαντηλα', 'βαμβακι',
    'πανακια ντεμακιγιαζ',
    // common oral-care abbreviation (colgate/aim/sensodyne "ΟΔ/ΜΑ") + brands
    'οδ/μα', 'οδ/κη', 'colgate', 'sensodyne', 'elmex', 'oral-b',
    'l\'oreal', 'loreal', 'garnier', 'nivea', 'pantene', 'syoss', 'palette',
    'schwarzkopf', 'gliss', 'elvive', 'koleston', 'excellence creme', 'diadermine',
    'bioten', 'dove', 'rexona', 'veet', 'tena', 'kotex', 'always', 'tampax',
    // '=αρωμα' boundary-matched: bare it ate "Τσάι ΑΡΩΜΑτικό" and every
    // "αρωματικό" household item (real perfumes say "Άρωμα"/"Eau de").
    'gillette', 'wilkinson', 'κολωνια', '=αρωμα', 'eau de', 'βαφη',
    // English/Latin brands + product words the Greek lists missed (null-native
    // chains: masoutis/sklavenitis/ab name-only). carroten/noxzema=suncare,
    // wellaflex=hairspray, hansaplast=plasters, septona/dermasoft=cotton+wipes.
    // 'sanex' + 'ευαισθητη περιοχη': intimate washes say "Υγρό Καθαρισμού"
    // and would otherwise drift to the cleaning department.
    'sanex', 'ευαισθητη περιοχη',
    'carroten', 'noxzema', 'wellaflex', 'hansaplast', 'septona', 'dermasoft',
    'after shave', 'aftershave', 'old spice', 'wet hankies', 'hankies',
    'cotton buds', 'μπατονετ', 'εσωρουχ', 'le petit marseillais', 'papoutsanis', 'καραβακι',
  ] },
  { dept: 'Σνακ & Γλυκά', terms: [
    'σοκολατ', 'chocolate', 'μπισκοτ', 'γκοφρετ', 'σοκοφρετ', 'wafer', 'τσιπς', 'chips', 'πατατακ',
    'snack', 'σνακ', 'καραμελ', 'τσιχλ', 'γαριδακ', 'κρουτον', 'ποπ κορν', 'popcorn',
    // 'καρυδι' (walnut) not bare 'καρυδ' — that ate κα­ρύδα (coconut) flavours.
    'ξηρους καρπους', 'ξηροι καρποι', 'φιστικ', 'αμυγδαλ', 'καρυδι', 'καρυδοψιχ', 'σταφιδ', 'κρακερ',
    'cracker', 'γλυκο κουταλιου', 'κρουασαν', 'croissant', 'κεικ', 'cake', 'ζελε',
    'λουκουμ', 'μπαρα δημητρ', 'πραλιν', 'νουγκατ', 'γκοφρ', 'kinder', 'ferrero',
    'κουλουρακ', 'γλειφιτζουρ',
    'lacta', 'oreo', 'merenda', 'σοκολατακ',
    // snack brands whose flavour words ('cola', 'τυρι', 'αλάτι', 'φρούτα',
    // 'μπέικον') would otherwise drag them into drinks/cheese/pantry/deli
    'haribo', 'cheetos', 'lays', "lay's", 'tsakiris',
  ] },
  { dept: 'Γαλακτοκομικά & Είδη Ψυγείου', terms: [
    // bare 'milk' removed — it ate "Body Milk" lotions; 'γαλα' covers Greek.
    'γαλα', 'γιαουρτ', 'yogurt', 'βουτυρο', 'μαργαριν', 'αυγα', 'κρεμα γαλακτος',
    'επιδορπ', 'ρυζογαλο', 'κρεμ καραμελ', 'ζυμη πιτσας', 'φυλλο κρουστας', 'σφολιατ',
    'ανθος αραβοσιτου', 'κρεμα φρεσκια', 'ροφημα βρωμης', 'ροφημα σογιας',
    'πουτιγκ', 'danette', 'στραγγιστ', 'lurpak',
  ] },
  { dept: 'Αρτοποιία', terms: [
    'ψωμι', 'αρτος', 'τοστ', 'φρυγανι', 'κριτσιν', 'παξιμαδ', 'τσουρεκ', 'σταρενι',
    'πιτα ', 'πιτες', 'λαγανα', 'ντακος', 'ζυμαρι πιτας', 'αρτιδια', 'ψωμακ',
  ] },
  // Κάβα + Πρωινό run BEFORE Φρούτα so fruit-flavoured drinks land as drinks —
  // "Χυμός Πορτοκάλι" used to hit 'πορτοκαλ' (Φρούτα) before 'χυμο' got a shot.
  { dept: 'Κάβα', terms: [
    // NOTE: short Latin tokens are space-padded so they match whole words only.
    // Bare substrings caused false hits: 'gin'→"oriGINal", 'rum'→"seRUM",
    // 'tonic'→"isoTONIC", 'νερο'/'νερου'→"ροδόΝΕΡΟ"/"αποσκληρυντικό ΝΕΡΟΥ".
    // 'beer' (→"orzene BEER recipes σαμπουάν") and 'energy' (→"nivea/fa ENERGY
    // boost/gel" cosmetics) are dropped — Greek drinks use μπύρα / explicit
    // "energy drink", so the bare words only cause cosmetic false positives.
    // '=τζιν' boundary-matched — the bare substring ate "ΤΖΙΝτζερ" (ginger).
    // Κάβα = alcohol + soft drinks/water. Juices ('χυμο') and ice tea moved to
    // Πρωινό & Ροφήματα — a Greek shopper reads "Κάβα" as the drinks/alcohol
    // shelf, and finding ΑΜΙΤΑ or τοματοχυμό there reads as a bug (it was one).
    'μπυρα', 'μπιρα', 'κρασι', 'wine', 'οινος', 'ουζο', 'τσιπουρο', 'βοτκα', 'vodka',
    'ουισκι', 'whisky', 'whiskey', 'gin', '=τζιν', 'ρουμι', 'rum', 'λικερ', 'σαμπανι',
    'αναψυκτικ', 'coca', 'cola', 'pepsi', 'σπριτ', 'sprite', 'fanta',
    'εμφιαλωμεν', 'σοδα', 'tonic', 'ενεργειακο ποτο', 'energy drink',
    'αναψυκτικα', 'μεταλλικο νερο', 'φυσικο νερο', 'επιτραπεζιο νερο', 'monster', 'red bull',
    'ρετσινα', 'μηλιτης', 'somersby', 'schweppes', 'xixo', 'powerade', 'λεμοναδα', 'πορτοκαλαδα', 'γκαζοζα',
  ] },
  { dept: 'Πρωινό & Ροφήματα', terms: [
    'καφε', 'nescafe', 'espresso', 'nespresso', 'καπουτσιν', 'φραπε', 'δημητριακα', 'cornflakes',
    'κουακερ', 'βρωμη', '=μελι', 'μαρμελαδ', 'ταχιν', 'φιστικοβουτυρ', 'τσαι', 'tea',
    'ροφημα κακαο', 'κακαο', 'nesquik', 'στιγμιαιος', 'φακελακια τσαι',
    // juices live with breakfast, not the Κάβα shelf ('tea' above already
    // catches ice tea). Tomato juice is intercepted by Κονσέρβες first.
    // '=νεκταρ' boundary-matched: the substring ate ΝΕΚΤΑΡίνια (nectarines).
    'χυμο', '=νεκταρ', 'φρουτοποτο',
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
    'misko', 'knorr', 'penne', 'ταλιατελ', 'φιδες', 'κριθαρακ', 'πουρες', 'μπεσαμελ', 'ξιδι',
  ] },
  // Φρούτα & Λαχανικά runs LAST on purpose: fruit/vegetable words are the most
  // common scent & flavour words in Greek product names ("Klinex Λεμόνι",
  // "σαμπουάν Πράσινο Μήλο", "σάλτσα ντομάτας"). Only a name that matched NO
  // other department reads as actual produce. Chains with native taxonomies
  // never reach this rule for produce — their labels map directly.
  { dept: 'Φρούτα & Λαχανικά', terms: [
    'φρουτ', 'λαχανικ', 'μηλο', 'μηλα', 'μπανανα', 'πορτοκαλ', 'λεμον', 'μανταριν',
    'ντοματ', 'πατατ', 'κρεμμυδ', 'σκορδ', 'μαρουλ', 'αγγουρ', 'καροτ', 'μπροκολ',
    'κουνουπιδ', 'πιπερι', 'μελιτζαν', 'κολοκυθ', 'σπανακ', 'μαϊνταν', 'ανηθ', 'σελιν',
    'φραουλ', 'σταφυλ', 'αχλαδ', 'ροδακιν', 'νεκταριν', 'βερικοκ', 'πεπον', 'καρπουζ', 'ακτινιδ',
    'αβοκαντο', 'μανιταρ', 'ραπανακ', 'παντζαρ', 'κερασ', 'τοματιν',
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
//
// A '=' prefix forces whole-word matching for a GREEK token too — for short
// words that are also substrings of unrelated words: '=λακ' (hairspray) must
// not fire inside "μαΛΑΚτικό"/"ανταΛΑΚτικό"; '=μελι' (honey) not inside
// "ΜΕΛΙτζάνα".
function buildMatcher(term: string): (text: string) => boolean {
  const t = term.trim();
  if (t.startsWith('=')) {
    const re = new RegExp(`(^|[^a-z0-9α-ω])${t.slice(1)}([^a-z0-9α-ω]|$)`);
    return (text) => re.test(text);
  }
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
  // 2026-06-11 audit additions — each verified against live rows (see commit).
  'Μπάνιου': 'Είδη Καθαρισμού & Σπιτιού',          // kritikos bathroom cleaners
  'Υγρά Μαλακτικά': 'Είδη Καθαρισμού & Σπιτιού',   // mymarket fabric softeners
  'Χαρτομάντηλα': 'Είδη Καθαρισμού & Σπιτιού',     // mymarket paper tissues
  'Παιδικά - Τρίγωνα': 'Τυριά & Αλλαντικά',        // kritikos cheese triangles (La Vache Qui Rit)
  'Πίτσες - Πεινιρλί': 'Κατεψυγμένα',
  'Φύλλα - Βάσεις - Ζύμες': 'Κατεψυγμένα',
  'Σαλάτες': 'Σαλάτες & Αλοιφές',                  // kritikos deli salads/τζατζίκι
  'Ελιές': 'Είδη Παντοπωλείου',
  'Έτοιμα Μιξ': 'Είδη Παντοπωλείου',               // kritikos Maggi spice mixes
  'Μιλήτες': 'Κάβα',                               // kritikos typo for Μηλίτες (Somersby ciders)
  'Λειτουργικά': 'Γαλακτοκομικά & Είδη Ψυγείου',   // kritikos functional dairy
  'Υψηλής Παστερίωσης': 'Γαλακτοκομικά & Είδη Ψυγείου',
  // mymarket spells this with a LATIN 'E' and uses it for adult suncare;
  // kritikos' Greek-Ε 'Ενηλίκων' is dessert puddings → deliberately NOT aliased
  // (keywords handle it), the two labels only look identical.
  'Eνηλίκων': 'Προσωπική Φροντίδα',
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

// ===== Per-chain native maps — the primary signal =====
// Complete label→department maps for the chains that ship native categories
// (mymarket/kritikos/ab cover ~72% of the catalog). A map hit BEATS all
// keyword guessing; see native-category-maps.ts for the polysemy war stories
// ('Παιδικά', 'Λευκά', 'Γάλα' mean different things per chain).
// A null map value = "label known but too mixed for one department" — fall
// through to keywords WITHOUT reporting the label as unmapped.
const CHAIN_LOOKUP = new Map<string, Map<string, string | null>>();
for (const [chain, labels] of Object.entries(CHAIN_NATIVE_MAPS)) {
  const m = new Map<string, string | null>();
  for (const [label, dept] of Object.entries(labels)) m.set(normalize(label), dept);
  CHAIN_LOOKUP.set(chain, m);
}

export function hasChainMap(chain: string | null | undefined): boolean {
  return !!chain && CHAIN_LOOKUP.has(chain);
}

/**
 * Chain-aware categorize. Returns whether the chain map decided (`mapped`) so
 * ingest can report unmapped labels for curation instead of silently guessing.
 */
export function categorizeForChain(
  chain: string | null | undefined,
  name: string | null | undefined,
  nativeHint?: string | null
): { dept: string; mapped: boolean } {
  if (chain && nativeHint) {
    const m = CHAIN_LOOKUP.get(chain);
    const key = normalize(nativeHint);
    if (m?.has(key)) {
      const hit = m.get(key);
      if (hit) return { dept: hit, mapped: true };
      // Known-but-mixed label: keyword-split on the NAME ONLY — the mixed
      // label itself must not steer the keywords (e.g. 'Μπύρες, Αναψυκτικά…'
      // would drag every juice in the bucket to Κάβα via the native-kw step).
      return { dept: categorize(name, null), mapped: true };
    }
  }
  return { dept: categorize(name, nativeHint), mapped: false };
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
