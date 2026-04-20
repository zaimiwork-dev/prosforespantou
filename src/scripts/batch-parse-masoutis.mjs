import { spawnSync } from 'child_process';

const SM_ID = 'masoutis';

// File → category mapping (category must match values in src/lib/constants.js)
const MAPPING = [
  ['masoutis_prosfores.html', 'Άλλο'],
  ['masoutis_fruits.html', 'Φρούτα & Λαχανικά'],
  ['Αρτοζαχαροπλαστείο _ Μασούτης Μακεδονίας _ Wolt.html', 'Αρτοποιία'],
  ['Βρεφική Φροντίδα _ Μασούτης Μακεδονίας _ Wolt.html', 'Προσωπική Φροντίδα'],
  ['Dressing _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Είδη Καθαρισμού _ Μασούτης Μακεδονίας _ Wolt.html', 'Είδη Καθαριότητας'],
  ['Είδη Κατάψυξης _ Μασούτης Μακεδονίας _ Wolt.html', 'Κατεψυγμένα'],
  ['Είδη Κατοικιδίων _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Είδη Κονσέρβας _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Είδη Παντοπωλείου _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Είδη Σπιτιού _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Είδη Ψυγείου _ Μασούτης Μακεδονίας _ Wolt.html', 'Γαλακτοκομικά'],
  ['Ζυμαρικά - Όσπρια _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Κάβα _ Μασούτης Μακεδονίας _ Wolt.html', 'Ροφήματα'],
  ['Κρεοπωλείο _ Μασούτης Μακεδονίας _ Wolt.html', 'Κρέας & Ψάρι'],
  ['Μπισκότα - Ζαχαρώδη _ Μασούτης Μακεδονίας _ Wolt.html', 'Σνακ & Γλυκά'],
  ['Προσωπική Περιποίηση _ Μασούτης Μακεδονίας _ Wolt.html', 'Προσωπική Φροντίδα'],
  ['Πρωινά _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
  ['Snack - Ξηροί Καρποί _ Μασούτης Μακεδονίας _ Wolt.html', 'Σνακ & Γλυκά'],
  ['Υγιεινή & Χαρτικά _ Μασούτης Μακεδονίας _ Wolt.html', 'Είδη Καθαριότητας'],
  ['Υγιεινή Διατροφή _ Μασούτης Μακεδονίας _ Wolt.html', 'Άλλο'],
];

for (const [file, category] of MAPPING) {
  console.log(`\n━━━━━━━ ${file} → ${category} ━━━━━━━`);
  const r = spawnSync('node', ['--env-file=.env.local', 'src/scripts/parse-wolt-html.mjs', file, SM_ID, category], {
    stdio: 'inherit'
  });
  if (r.status !== 0) {
    console.error(`⚠️  ${file} exited with status ${r.status}`);
  }
}

console.log('\n🏁 Batch complete.');
