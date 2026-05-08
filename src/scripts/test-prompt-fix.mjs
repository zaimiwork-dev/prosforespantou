import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');

const apiKey = process.env.GROQ_API_KEY;

function calculateOverlap(str1, str2) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length >= 3);
  const set2 = new Set(norm(str2));
  return norm(str1).filter((w) => set2.has(w)).length;
}

const masterProducts = await prisma.product.findMany({
  where: { supermarket: 'masoutis' },
  select: { id: true, name: true },
});

const testCases = [
  'Φιξ Ελλάς Μπίρα Lager 330ml. 5+1Δώρο',
  'Arla Protein Ρόφημα Γάλακτος Φράουλα 50% Λιγότερη Ζάχαρη Χωρίς Γλουτένη 500γρ.',
  'Νιτσιάκος Food Master Nuggets Κοτόπουλο Ελληνικό Πανέ 800γρ.',  // benign control
];

for (const rawName of testCases) {
  const candidates = masterProducts
    .map((p) => ({ ...p, score: calculateOverlap(rawName, p.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const catalogList = candidates.map((p) => `${p.id} | ${p.name}`).join('\n');

  const prompt = `
You are an expert data matching AI for a Greek supermarket aggregator.
Match a RAW extracted deal name against a short list of CANDIDATE PRODUCTS, and assign a CATEGORY.

CANDIDATE PRODUCTS (Format: ID | Name):
${catalogList}

RAW DEAL TO MATCH:
Name: "${rawName}"
Price: 4.59

ALLOWED CATEGORIES (Pick exactly one):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

INSTRUCTIONS:
1. **BRAND MUST MATCH EXACTLY.** The first word(s) of the product name are the brand (e.g. "Φιξ Ελλάς", "Arla", "Pampers", "Coca-Cola"). If the brand of the RAW DEAL differs from every CANDIDATE PRODUCT's brand → "suggestedProductId": "NEW", confidence 100. A "Φιξ Ελλάς" beer is NEVER a match for a "Pils Hellas" beer; an "Arla Protein" drink is NEVER a match for a "Μεβγάλ High Protein" drink. Same product category, different brands = NEW.
2. **QUANTITY MUST MATCH EXACTLY.** Compare weight (γρ/g/kg), volume (ml/lt), pack size (τεμ/x). 750ml vs 1lt → NEW. 6x53γρ vs 10x53γρ → NEW.
3. Only if BOTH brand and quantity match → return the candidate's UUID with confidence reflecting how exact the variant match is.
4. Confidence is 0-100. Use 0 when no candidate has the right brand at all.
5. Category hints: Eggs → Είδη Παντοπωλείου; Cheeses/Deli → Τυριά & Αλλαντικά; Dips/Spreads → Σαλάτες & Αλοιφές; Canned → Κονσέρβες.
6. Return JSON ONLY with keys: rawName, suggestedProductId, confidence, category. No prose.

OUTPUT shape:
{ "rawName": "${rawName}", "suggestedProductId": "uuid-or-NEW", "confidence": 95, "category": "..." }
`;

  console.log(`\n━━━ TEST: "${rawName}"`);
  console.log(`   Top 3 candidates from pre-filter:`);
  for (const c of candidates.slice(0, 3)) console.log(`     • ${c.name}`);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 256,
    }),
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(text);
    const matched = candidates.find((c) => c.id === parsed.suggestedProductId);
    console.log(`   → Llama returned: confidence=${parsed.confidence}, suggested=${parsed.suggestedProductId === 'NEW' ? 'NEW' : (matched?.name || parsed.suggestedProductId)}`);
  } catch {
    console.log(`   → Failed to parse: ${text}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

process.exit(0);
