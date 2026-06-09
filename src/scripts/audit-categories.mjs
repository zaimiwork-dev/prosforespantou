// Category leak auditor — flags active Discounts whose department was decided
// by a Latin keyword that only matched GLUED inside a bigger word (the recurring
// false-positive class: 'ion'→"hydratION", 'pet'→"PETit", 'rum'→"seRUM").
// Greek stems are intentionally substring-matched, so they're not flagged here.
//
//   node src/scripts/audit-categories.mjs
//
// Use after editing the keyword lists in src/lib/categories.ts to confirm no new
// substring leaks crept in.
import 'dotenv/config';
import { categorizeTrace } from '../lib/categories.ts';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isLatin = (t) => /^[a-z0-9 ]+$/.test(t.trim());
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const gluedOnly = (text, term) =>
  !new RegExp('(^|[^a-z0-9])' + escapeRe(term.trim()) + '([^a-z0-9]|$)').test(text);

const { default: prisma } = await import('../lib/prisma.ts');
const now = new Date();
const rows = await prisma.discount.findMany({
  where: { isActive: true, validUntil: { gt: now } },
  select: { productName: true, subcategory: true },
});

const leaks = {};
for (const d of rows) {
  const tr = categorizeTrace(d.productName, d.subcategory);
  if (tr.via === 'name' && tr.term && isLatin(tr.term) && gluedOnly(norm(d.productName), tr.term)) {
    const key = `'${tr.term}' → ${tr.dept}`;
    (leaks[key] = leaks[key] || []).push(d.productName);
  }
}

const sorted = Object.entries(leaks).sort((a, b) => b[1].length - a[1].length);
console.log('=== Latin-substring category leaks ===');
if (sorted.length === 0) console.log('none 🎉');
for (const [k, arr] of sorted) {
  console.log(`\n${k}  (${arr.length})`);
  for (const n of arr.slice(0, 4)) console.log('   ', n.slice(0, 54));
}
await prisma.$disconnect();
