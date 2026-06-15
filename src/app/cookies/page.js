import { LegalLayout, H2 } from '@/components/LegalLayout';

export const metadata = {
  title: 'Πολιτική Cookies',
  description: 'Ποια cookies και τοπικά δεδομένα χρησιμοποιεί η εφαρμογή Προσφορές Παντού και πώς να αλλάξεις τις επιλογές σου.',
};

// NOTE for the owner: the inventory below is ACCURATE to the current codebase
// (localStorage keys + the analytics events). Keep it in sync if you add trackers.
// The prose can be polished, but do NOT remove an item that's actually in use.
export default function CookiesPage() {
  const cell = { border: '1px solid #eee', padding: '8px 10px', textAlign: 'left', verticalAlign: 'top', fontSize: 13.5 };
  return (
    <LegalLayout title="Πολιτική Cookies" updated="2026-06-15">
      <p>
        Η εφαρμογή <strong>Προσφορές Παντού</strong> χρησιμοποιεί έναν μικρό αριθμό
        cookies και τεχνολογιών τοπικής αποθήκευσης (localStorage) στη συσκευή σου.
        Χωρίζονται σε <strong>απολύτως απαραίτητα</strong> (λειτουργούν πάντα) και
        <strong> στατιστικά/προτιμήσεων</strong> (ενεργοποιούνται μόνο αν δώσεις τη
        συγκατάθεσή σου στο σχετικό banner).
      </p>

      <H2>Δεν τρέχει κανένα στατιστικό χωρίς τη συγκατάθεσή σου</H2>
      <p>
        Μέχρι να πατήσεις «Αποδοχή», δεν καταγράφουμε καμία ενέργειά σου και δεν
        δημιουργούμε αναγνωριστικό συνεδρίας. Αν πατήσεις «Απόρριψη», τα στατιστικά
        παραμένουν ανενεργά και διαγράφουμε το τυχόν αναγνωριστικό. Μπορείς να αλλάξεις
        γνώμη όποτε θες από τον σύνδεσμο «Ρυθμίσεις cookies» στο υποσέλιδο.
      </p>

      <H2>Τι αποθηκεύεται στη συσκευή σου</H2>
      <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0 4px' }}>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            <th style={cell}>Όνομα</th><th style={cell}>Σκοπός</th><th style={cell}>Κατηγορία</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={cell}><code>cookie-consent</code></td><td style={cell}>Θυμάται την επιλογή σου (αποδοχή/απόρριψη).</td><td style={cell}>Απαραίτητο</td></tr>
          <tr><td style={cell}><code>sid</code></td><td style={cell}>Ανώνυμο αναγνωριστικό συνεδρίας για στατιστικά χρήσης. Δημιουργείται μόνο μετά την αποδοχή.</td><td style={cell}>Στατιστικά</td></tr>
          <tr><td style={cell}>Προτιμήσεις (αγαπημένα, καταστήματα, ενδιαφέροντα, onboarding)</td><td style={cell}>Θυμάται τις επιλογές σου ώστε να βλέπεις πιο σχετικές προσφορές. Μένουν στη συσκευή σου.</td><td style={cell}>Προτιμήσεων</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: '#777' }}>
        Οι προτιμήσεις (αγαπημένα κ.λπ.) αποθηκεύονται <em>τοπικά στη συσκευή σου</em> και
        δεν αποστέλλονται σε εμάς — εκτός αν στο μέλλον συνδεθείς με λογαριασμό (προαιρετικό).
      </p>

      <H2>Στατιστικά χρήσης (μετά από συγκατάθεση)</H2>
      <p>
        Όταν αποδεχτείς, καταγράφουμε ανώνυμα ποιες προσφορές, αναζητήσεις και σελίδες
        βλέπεις, ώστε να καταλάβουμε τι σε ενδιαφέρει και να βελτιώνουμε την εφαρμογή. Η
        καταγραφή συνδέεται με το ανώνυμο <code>sid</code> — όχι με το όνομα ή το email σου.
        Λεπτομέρειες για τα δεδομένα και τα δικαιώματά σου στην{' '}
        <a href="/aporrito" style={{ color: '#009de0' }}>Πολιτική Απορρήτου</a>.
      </p>

      <H2>Υπηρεσίες τρίτων</H2>
      <p>
        Για να λειτουργεί η εφαρμογή χρησιμοποιούμε παρόχους που ενδέχεται να θέτουν
        τεχνικά cookies ή να επεξεργάζονται τεχνικά δεδομένα (π.χ. διεύθυνση IP για
        ασφάλεια/φιλοξενία): <strong>Vercel</strong> (φιλοξενία), <strong>Supabase</strong>{' '}
        (βάση δεδομένων &amp; εικόνες), <strong>Sentry</strong> (καταγραφή σφαλμάτων) και,
        για τα ενημερωτικά email, <strong>Resend</strong>. Δες την Πολιτική Απορρήτου για τη
        πλήρη λίστα.
      </p>

      <H2>Πώς να ελέγξεις τα cookies</H2>
      <p>
        Μπορείς να ανακαλέσεις τη συγκατάθεση από τις «Ρυθμίσεις cookies» στο υποσέλιδο, ή
        να διαγράψεις τα τοπικά δεδομένα από τις ρυθμίσεις του browser σου.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, color: '#777' }}>
        Υπεύθυνος επεξεργασίας: το φυσικό πρόσωπο Σίλβι Ζαΐμι. Επικοινωνία:{' '}
        <a href="mailto:zaimiwork@gmail.com" style={{ color: '#009de0' }}>zaimiwork@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
