import { describe, it, expect } from 'vitest';
import { categorize, categorizeForChain } from './categories';

// ===== Root cause (2026-06-12): per-chain native maps beat keywords =====
describe('categorizeForChain — native maps are the primary signal', () => {
  it('the same label means different things at different chains', () => {
    // 'Παιδικά': kids' suncare at mymarket, baby yogurt at kritikos
    expect(categorizeForChain('mymarket', 'Nivea Sun Children Lotion SPF50+', 'Παιδικά').dept)
      .toBe('Προσωπική Φροντίδα');
    expect(categorizeForChain('kritikos', 'ΚΡΙ ΚΡΙ BABIES ΠΡΩΤΟ ΓΙΑΟΥΡΤΙ ΛΕΥΚΟ 2*140ΓΡ', 'Παιδικά').dept)
      .toBe('Γαλακτοκομικά & Είδη Ψυγείου');
    // 'Λευκά': white wine at mymarket, white cheese at kritikos
    expect(categorizeForChain('mymarket', 'Λήμνος Λευκός Οίνος 750ml', 'Λευκά').dept).toBe('Κάβα');
    expect(categorizeForChain('kritikos', 'ΔΩΔΩΝΗ ΕΛΑΦΡΥ ΣΕ ΑΛΜΗ 400ΓΡ', 'Λευκά').dept).toBe('Τυριά & Αλλαντικά');
    // 'Συμπυκνωμένα': fabric softener at mymarket, tomato juice at kritikos
    expect(categorizeForChain('mymarket', 'Soupline Μαλακτικό Συμπυκνωμένο', 'Συμπυκνωμένα').dept)
      .toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorizeForChain('kritikos', 'ΚΥΚΝΟΣ ΧΥΜΟΣ ΤΟΜΑΤΑΣ ΕΛΑΦΡΑ ΣΥΜΠΥΚΝ. 500ΓΡ', 'Συμπυκνωμένα').dept)
      .toBe('Κονσέρβες');
  });

  it("kritikos 'Γάλα' is infant formula, not dairy", () => {
    expect(categorizeForChain('kritikos', 'ALMIRON GROWING UP 12-24 1L', 'Γάλα').dept).toBe('Βρεφικά Είδη');
  });

  it('map hit wins over misleading name words (the Klinex-Λεμόνι class)', () => {
    const r = categorizeForChain('kritikos', 'KLINEX ΥΓΡ.ΠΑΝ ΠΑΤΩΜΑΤΟΣ ΛΕΜΟΝΙ XXL 15', 'Πανιά Καθαρισμού');
    expect(r).toEqual({ dept: 'Είδη Καθαρισμού & Σπιτιού', mapped: true });
  });

  it('AB Οπωροπωλείο is real produce', () => {
    expect(categorizeForChain('ab', 'Πιπεριές 3 Χρωμάτων Ελληνικές 450gr', 'Οπωροπωλείο').dept)
      .toBe('Φρούτα & Λαχανικά');
  });

  it('unknown labels fall back to keywords and report mapped:false', () => {
    const r = categorizeForChain('mymarket', 'Lavazza Καφές Espresso 250gr', 'Ολοκαίνουργιο Ράφι');
    expect(r.mapped).toBe(false);
    expect(r.dept).toBe('Πρωινό & Ροφήματα');
  });

  it('chains without a map (masoutis) just use keywords', () => {
    expect(categorizeForChain('masoutis', 'Lavazza Καφές Espresso 250gr', null).dept)
      .toBe('Πρωινό & Ροφήματα');
  });
});

describe('keyword fallback — Φρούτα runs LAST (scent words must not win)', () => {
  it('fruit-scented cleaning products are cleaning, not produce', () => {
    expect(categorize('KLINEX Ultra Χλωρίνη Λεμόνι 2lt')).toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('AJAX Boost Καθαριστικό Πατώματος Ξίδι & Μήλο 1lt')).toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('FINISH Καθαριστικό Πλυντηρίου Πιάτων Υγρό Λεμόνι 250ml')).toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it('tomato sauce and potato puree are pantry, not produce', () => {
    expect(categorize('Zanae Salsissimo Σάλτσα Ντομάτας Για Ζυμαρικά Napoletana')).toBe('Είδη Παντοπωλείου');
    expect(categorize('ΓΙΩΤΗΣ Πουρές Πατάτας Στιγμής Vegan 2x125g')).toBe('Είδη Παντοπωλείου');
  });

  it('λεμονάδα is a soft drink, not a lemon', () => {
    expect(categorize('ΛΟΥΞ Λεμονάδα 6x330ml')).toBe('Κάβα');
  });

  it('fruit-flavoured sweets are snacks, not fruit', () => {
    expect(categorize('Orama Κουλουράκι Πλεξούδα Πορτοκαλιού Παραδοσιακό')).toBe('Σνακ & Γλυκά');
    expect(categorize('Γλειφιτζούρι Melody Pops Φράουλα 1 Τεμάχιο')).toBe('Σνακ & Γλυκά');
  });

  it('actual fresh produce still lands in Φρούτα & Λαχανικά', () => {
    expect(categorize('Πατάτες Κύπρου συσκευασμένες')).toBe('Φρούτα & Λαχανικά');
    expect(categorize('Μήλα Στάρκιν Εγχώρια συσκευασμένα')).toBe('Φρούτα & Λαχανικά');
    expect(categorize('Κρεμμύδια Ξερά Ξανθά Εγχώρια')).toBe('Φρούτα & Λαχανικά');
  });
});

// Every name below is a real row from the live DB that was miscategorized
// before the 2026-06-11 leak fixes. If one of these breaks, a keyword edit
// reintroduced a substring leak — see buildMatcher() and the rule ordering
// notes in categories.ts.
describe('categorize — substring-leak regressions', () => {
  it("'=λακ' no longer eats fabric softeners (μαΛΑΚτικό)", () => {
    expect(categorize('Soupline Συμπυκνωμένο Μαλακτικό Ρούχων Mistral 60mez. 1,26lt.'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('CAJOLINE ΣΥΜΠ.ΜΑΛ/ΚΟ RED FRUITS(1096ML)52ΜΕΖ'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it("'=λακ' no longer eats razor refills (ανταΛΑΚτικά) — brand still wins", () => {
    expect(categorize('GILLETTE FUSION ANT/KA 4Τ')).toBe('Προσωπική Φροντίδα');
  });

  it('real hairspray still matches λακ as a whole word', () => {
    expect(categorize('Λακ Μαλλιών Extra Strong 400ml')).toBe('Προσωπική Φροντίδα');
    expect(categorize('TAFT GEL MAXX POWER 300ML')).toBe('Προσωπική Φροντίδα');
  });

  it("stain removers are cleaning, not personal care (διαβοΛΑΚος bug)", () => {
    expect(categorize('DR.BECKMANN Διαβολάκος του Λεκέ Καθαριστικό για Αίμα & Πρωτεΐνες'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it('laundry scent boosters and fabric sprays are cleaning, not perfume', () => {
    expect(categorize('LENOR Beads Ενισχυτικό Αρώματος Ρούχων Gold Orchid 495g'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('Soupline Αρωματικό Σπρέι Υφασμάτων Mistral 300ml.'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it('paper tissues are home goods, not personal care', () => {
    expect(categorize('Zewa Χαρτομάντηλα Facial Softis 4Φύλλων 80τεμ.'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it("'baby' detergent lines stay in cleaning (Αρκάδι Baby bug)", () => {
    expect(categorize('ΑΡΚΑΔΙ Baby Απορρυπαντικό Πλυντηρίου Ρούχων Υγρό Πράσινο Σαπούνι'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
    // ...while baby toiletries still go to Βρεφικά
    expect(categorize("Johnson's Baby Σαμπουάν 500ml.")).toBe('Βρεφικά Είδη');
  });

  it('cleaning tools without cleaning words match via brand/noun', () => {
    expect(categorize('Scotch Brite Αποχνουδωτής Ανταλλακτικό 30Φύλλων 45m.'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('Scotch-Brite Κοντάρι Με Φαρδύ Βίδωμα (Διάφορα Χρώματα)'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });
});

describe('categorize — beverage split (2026-06-12)', () => {
  it('juices are breakfast/beverages, not the Κάβα shelf', () => {
    expect(categorize('AMITA Motion Χυμός Φυσικός 4x330ml')).toBe('Πρωινό & Ροφήματα');
    expect(categorize('ΟΛΥΜΠΟΣ Φυσικός Χυμός Πορτοκάλι 250ml')).toBe('Πρωινό & Ροφήματα');
  });

  it('ice tea follows juices to breakfast/beverages', () => {
    expect(categorize('LIPTON Zero Ice Tea Ροδάκινο Χωρίς ζάχαρη 500ml')).toBe('Πρωινό & Ροφήματα');
  });

  it('tomato juice is a cooking ingredient (Κονσέρβες), not a drink', () => {
    expect(categorize('KYKNOS Χυμός Ντομάτας Ελαφρά Συμπυκνωμένος 500g')).toBe('Κονσέρβες');
    expect(categorize('ΜΙΝΕΡΒΑ Χωριό Χυμός Ντομάτας Ελαφρώς Συμπυκνωμένος 2x500g')).toBe('Κονσέρβες');
  });

  it('alcohol and soft drinks stay in Κάβα', () => {
    expect(categorize('Βεργίνα Μπίρα Κουτί 330ml (9+3 Δώρο)')).toBe('Κάβα');
    expect(categorize('COCA COLA ΚΟΥΤΙ 330ML(5+1)Δ')).toBe('Κάβα');
    expect(categorize('MONSTER Juiced Ενεργειακό Ποτό Mango Loco 500ml')).toBe('Κάβα');
  });

  it('disposable cups are home goods even though they say Αναψυκτικού', () => {
    expect(categorize('My Home Ποτήρι Νερού Αναψυκτικού Διαφανές 270ml 50 Τεμάχια'))
      .toBe('Είδη Καθαρισμού & Σπιτιού');
  });

  it('disposable razors stay personal care (μιας χρήσης must not be a home term)', () => {
    expect(categorize('GILLETTE Blue 3 Ξυραφάκια Μιας Χρήσης Smooth 6τεμ')).toBe('Προσωπική Φροντίδα');
  });

  it("'=νεκταρ' matches nectar drinks but not nectarines", () => {
    expect(categorize('VIVA Νέκταρ Ανανάς 1lt')).toBe('Πρωινό & Ροφήματα');
    expect(categorize('Νεκταρίνια Ελληνικά Χύμα 1kg')).toBe('Φρούτα & Λαχανικά');
  });

  it('φρουτοποτό is a beverage, not fruit', () => {
    expect(categorize('Ηβη Φρουτοποτό Βύσσινο 1lt')).toBe('Πρωινό & Ροφήματα');
  });

  it("'=αρωμα' no longer eats aromatic tea", () => {
    expect(categorize('Loyd Τσάι Αρωματικό Φρούτα Του Δάσους Σε Πυραμίδες 20x2γρ.'))
      .toBe('Πρωινό & Ροφήματα');
  });

  it('bake rolls are snacks despite bacon/cheese flavour words', () => {
    expect(categorize('7Days Bake Rolls Μπέικον 150γρ.')).toBe('Σνακ & Γλυκά');
  });
});

describe('categorize — rule-order fixes', () => {
  it('fruit-flavoured drinks are drinks, not fruit', () => {
    expect(categorize('Χυμός Πορτοκάλι Φυσικός 1L')).toBe('Πρωινό & Ροφήματα');
  });

  it('honey is breakfast but eggplants are not (=μελι boundary)', () => {
    expect(categorize('Μέλι Θυμαρίσιο Κρήτης 450γρ')).toBe('Πρωινό & Ροφήματα');
    expect(categorize('Μελιτζάνες Τσακώνικες')).toBe('Φρούτα & Λαχανικά');
  });

  it("'milk' no longer drags body lotions into dairy", () => {
    expect(categorize('B.U Body Milk Ipanema Girl 200ml')).not.toBe('Γαλακτοκομικά & Είδη Ψυγείου');
  });

  it("kritikos' ΚΤΨ abbreviation lands in frozen", () => {
    expect(categorize('ΥΦΑΝΤΗΣ ΠΙΤΣΑ ROCK N ROLL ΜΑΡΓΑΡΙΤΑ ΚΤΨ 2*420Γ')).toBe('Κατεψυγμένα');
  });

  it('cheese brands without cheese words land in Τυριά', () => {
    expect(categorize('Dirollo Classic Σε Φέτες 175gr')).toBe('Τυριά & Αλλαντικά');
    expect(categorize('La Vache Qui Rit Τρίγωνο (24 Μερίδες) 384gr')).toBe('Τυριά & Αλλαντικά');
  });
});

describe('categorize — native aliases', () => {
  it('maps verified chain labels to departments', () => {
    expect(categorize('OVERLAY EXPRESS ΜΠΑΝΙΟ ΑΠΟΛΥΜΑΝΤΙΚΟ 650ML', 'Μπάνιου')).toBe('Είδη Καθαρισμού & Σπιτιού');
    expect(categorize('SOMERSBY APPLE ΦΙΑΛΗ 330ML', 'Μιλήτες')).toBe('Κάβα');
    expect(categorize('Gaea Πράσινες Ελιές Χωρίς Κουκούτσι Σακούλα 150gr', 'Ελιές')).toBe('Είδη Παντοπωλείου');
  });

  it('Latin-E Eνηλίκων (mymarket suncare) ≠ Greek-Ε Ενηλίκων (kritikos desserts)', () => {
    expect(categorize('Carroten Αντηλιακό Dry Mist Σπρέυ SPF50 200ML', 'Eνηλίκων')).toBe('Προσωπική Φροντίδα');
    expect(categorize('ΜΕΒΓΑΛ HIGH PROTEIN ΠΟΥΤΙΓΚΑ ΚΑΚΑΟ 200ΓΡ', 'Ενηλίκων')).toBe('Γαλακτοκομικά & Είδη Ψυγείου');
  });
});
