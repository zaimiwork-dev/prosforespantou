import fs from 'fs';
import { execSync } from 'child_process';

const files = [
  'Dressing _ Μασούτης Μακεδονίας _ Wolt.html',
  'masoutis_fruits.html',
  'Snack - Ξηροί Καρποί _ Μασούτης Μακεδονίας _ Wolt.html',
  'Αρτοζαχαροπλαστείο _ Μασούτης Μακεδονίας _ Wolt.html',
  'Βρεφική Φροντίδα _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Καθαρισμού _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Κατάψυξης _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Κατοικιδίων _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Κονσέρβας _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Παντοπωλείου _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Σπιτιού _ Μασούτης Μακεδονίας _ Wolt.html',
  'Είδη Ψυγείου _ Μασούτης Μακεδονίας _ Wolt.html',
  'Ζυμαρικά - Όσπρια _ Μασούτης Μακεδονίας _ Wolt.html',
  'Κάβα _ Μασούτης Μακεδονίας _ Wolt.html',
  'Κρεοπωλείο _ Μασούτης Μακεδονίας _ Wolt.html',
  'Μπισκότα - Ζαχαρώδη _ Μασούτης Μακεδονίας _ Wolt.html',
  'Προσωπική Περιποίηση _ Μασούτης Μακεδονίας _ Wolt.html',
  'Πρωινά _ Μασούτης Μακεδονίας _ Wolt.html',
  'Υγιεινή & Χαρτικά _ Μασούτης Μακεδονίας _ Wolt.html',
  'Υγιεινή Διατροφή _ Μασούτης Μακεδονίας _ Wolt.html'
];

for (const file of files) {
  console.log(`\n🚀 Processing: ${file}`);
  try {
    // Determine category from filename
    let category = 'Άλλο';
    if (file.includes('Dressing')) category = 'Dressing';
    if (file.includes('fruits')) category = 'Φρούτα & Λαχανικά';
    if (file.includes('Snack')) category = 'Σνακ & Γλυκά';
    if (file.includes('Αρτοζαχαροπλαστείο')) category = 'Αρτοποιία';
    if (file.includes('Βρεφική')) category = 'Βρεφικά Είδη';
    if (file.includes('Καθαρισμού')) category = 'Είδη Καθαρισμού & Σπιτιού';
    if (file.includes('Κατάψυξης')) category = 'Κατεψυγμένα';
    if (file.includes('Κατοικιδίων')) category = 'Είδη Κατοικιδίων';
    if (file.includes('Κονσέρβας')) category = 'Κονσέρβες';
    if (file.includes('Παντοπωλείου')) category = 'Είδη Παντοπωλείου';
    if (file.includes('Σπιτιού')) category = 'Είδη Καθαρισμού & Σπιτιού';
    if (file.includes('Ψυγείου')) category = 'Γαλακτοκομικά & Είδη Ψυγείου';
    if (file.includes('Ζυμαρικά')) category = 'Είδη Παντοπωλείου';
    if (file.includes('Κάβα')) category = 'Κάβα';
    if (file.includes('Κρεοπωλείο')) category = 'Κρέας & Ψάρι';
    if (file.includes('Μπισκότα')) category = 'Σνακ & Γλυκά';
    if (file.includes('Περιποίηση')) category = 'Προσωπική Φροντίδα';
    if (file.includes('Πρωινά')) category = 'Πρωινό & Ροφήματα';
    if (file.includes('Χαρτικά')) category = 'Είδη Καθαρισμού & Σπιτιού';
    if (file.includes('Διατροφή')) category = 'Άλλο';

    execSync(`node src/scripts/parse-wolt-html.mjs "${file}" masoutis "${category}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

console.log('\n✨ All categories processed!');
