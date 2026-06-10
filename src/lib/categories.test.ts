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

describe('categorize — rule-order fixes', () => {
  it('fruit-flavoured drinks are drinks, not fruit', () => {
    expect(categorize('Χυμός Πορτοκάλι Φυσικός 1L')).toBe('Κάβα');
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
