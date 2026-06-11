import { describe, it, expect } from 'vitest';
import { categorize } from './categories';

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
