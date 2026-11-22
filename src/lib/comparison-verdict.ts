// AI verdicts on comparison pairs (owner decision 2026-11-22).
//
// Why: an audit of 196 comparisons shown for 200 random live offers found
// about 1 in 12–18 was a DIFFERENT product (Palmolive «Pink Massage» vs
// «Mineral Massage», rye vs wheat toast bread, Every Day Hyperdry vs
// Sensitive). Rules catch the mechanical cases (numberConflict, variant and
// pack guards); a word rule for the rest also dropped ~27% of correct pairs
// because the chains name the same thing in two languages (Vanilla/Βανίλιας,
// Orange/Πορτοκάλι). So every pair the rules let through is judged once by an
// LLM (src/scripts/verify-comparisons.mjs, nightly) and the verdict is stored
// in comparison_verdicts, keyed by the two chain-side names.
//
// Pure + strip-safe: imported by the server action, the nightly comparison
// count and the verifier script.

export type Verdict = 'same' | 'different' | 'unsure';

// How verdicts gate what the comparison sheet shows:
//   'off'               verdicts ignored
//   'block-different'   a pair judged different (or unsure) is hidden; a pair
//                       not judged yet is still shown — used while the first
//                       full verification run is in progress
//   'require-same'      only pairs judged «same» are shown (the goal)
export type VerdictMode = 'off' | 'block-different' | 'require-same';
// 'require-same' since 2026-11-22 evening: every live pair was judged (Groq +
// Claude Sonnet agents), and a held-out hand check of 100 random «same»
// verdicts found 0 different products (1 doubtful). A brand-new pair now
// waits for its first nightly check instead of showing unchecked.
export const VERDICT_MODE: VerdictMode = 'require-same';

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// 64-bit string hash (cyrb53's two 32-bit lanes, both kept), hex. Stable across
// runtimes (no node:crypto, no BigInt — tsconfig targets ES2017), and
// collisions are negligible for the ~10^4 pairs we hold.
function hash64(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** One chain's listing by NAME (legacy key; still the fallback without a code). */
export function listingKey(chain: string | null | undefined, name: string | null | undefined): string {
  return `${chain ?? ''}|${normalizeName(name)}`;
}

// One chain item — its «slot» (owner 2026-11-22: «a code for each item so it
// saves it in that slot whatever the name is»). Every live offer carries the
// chain's own item code; a verdict keyed by codes survives a rename, so the
// AI is asked about a pair of items once, ever. The name is only the fallback
// for a row without a code.
export type Side = {
  chain: string | null | undefined;
  code?: string | null;
  name?: string | null;
};

export function itemKey(s: Side): string {
  const code = s.code?.trim();
  return code ? `${s.chain ?? ''}#${code}` : listingKey(s.chain, s.name);
}

/** Order-independent key of a pair of chain items (by code, else by name). */
export function pairKeyOf(a: Side, b: Side): string {
  const x = itemKey(a);
  const y = itemKey(b);
  return hash64(x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`);
}

/**
 * LEGACY name-based key (2026-11-22, before item codes). Kept only to find and
 * re-key the rows written with it; new code uses pairKeyOf().
 */
export function pairKey(chainA: string | null | undefined, nameA: string | null | undefined, chainB: string | null | undefined, nameB: string | null | undefined): string {
  const a = listingKey(chainA, nameA);
  const b = listingKey(chainB, nameB);
  return hash64(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
}

/** May this pair be shown, given its verdict (undefined = not judged yet)? */
export function verdictAllows(verdict: Verdict | null | undefined, mode: VerdictMode = VERDICT_MODE): boolean {
  if (mode === 'off') return true;
  if (mode === 'require-same') return verdict === 'same';
  return verdict == null || verdict === 'same';
}

export type VerdictLookup = (key: string) => Verdict | undefined;

// Models whose verdict no automatic judge may change.
const FINAL_MODELS = new Set(['owner', 'barcode']);

/**
 * A second judge's verdict on a pair that may already have one (verdicts
 * imported from an outside judge — e.g. a Claude agent clearing the backlog).
 * Returns the verdict to store, or null to leave the row alone.
 *   - owner / barcode rows are final;
 *   - «different» stays different (any judge seeing a conflict is enough);
 *   - «same» needs both judges: a second opinion of different/unsure wins;
 *   - «unsure» is replaced only when `replaceUnsure` (a judge measured better).
 */
export function mergeVerdict(
  existing: { verdict: string; model: string } | undefined,
  incoming: Verdict,
  { replaceUnsure = false }: { replaceUnsure?: boolean } = {},
): Verdict | null {
  if (!existing) return incoming;
  if (FINAL_MODELS.has(existing.model)) return null;
  if (existing.verdict === 'different') return null;
  if (existing.verdict === 'same') return incoming === 'same' ? null : incoming;
  if (existing.verdict === 'unsure') return replaceUnsure && incoming !== 'unsure' ? incoming : null;
  return null;
}

/**
 * Keep the candidates the verdicts allow next to `source`. A row from the
 * source's own chain (its web + leaflet copy of the same offer) is not a
 * cross-chain claim and is never judged, so it always passes.
 */
export function filterByVerdict<T>(
  source: Side,
  candidates: T[],
  getSide: (c: T) => Side,
  lookup: VerdictLookup,
  mode: VerdictMode = VERDICT_MODE,
): T[] {
  if (mode === 'off') return candidates;
  return candidates.filter((c) => {
    const side = getSide(c);
    return side.chain === source.chain || verdictAllows(lookup(pairKeyOf(source, side)), mode);
  });
}

// Structural reader so both the Prisma client (server actions) and the one the
// .mjs scripts import dynamically satisfy it (same pattern as feed-freshness).
type VerdictReader = {
  comparisonVerdict: {
    findMany(args: any): Promise<{ pairKey: string; verdict: string }[]>;
  };
};

/**
 * Load verdicts into a lookup. With `keys`, only those pairs are read (the
 * per-request path); without, the whole table (the nightly scripts — it is
 * one row per live cross-chain pair, ~10^4).
 */
export async function loadVerdictLookup(prisma: VerdictReader, keys?: string[]): Promise<VerdictLookup> {
  if (VERDICT_MODE === 'off' || (keys && keys.length === 0)) return () => undefined;
  const rows = await prisma.comparisonVerdict.findMany({
    ...(keys ? { where: { pairKey: { in: [...new Set(keys)] } } } : {}),
    select: { pairKey: true, verdict: true },
  });
  const byKey = new Map(rows.map((r) => [r.pairKey, r.verdict as Verdict]));
  return (key) => byKey.get(key);
}
