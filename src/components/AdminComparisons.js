'use client';

// Admin «Συγκρίσεις» tab — the owner's review of the AI comparison check.
// Shoppers only see a comparison the check confirmed as the same product
// (lib/comparison-verdict, 'require-same'). Here the owner wins back pairs the
// check hid by caution («Ίδιο προϊόν») or hides one it let through
// («Διαφορετικό»). A decision is stored as model='owner' and is final.

import { useState, useEffect, useCallback, useRef } from "react";
import { listComparisonVerdicts } from "@/actions/admin/list-comparison-verdicts";
import { setComparisonVerdict } from "@/actions/admin/set-comparison-verdict";
import { SUPERMARKETS } from "@/lib/constants";
import { formatPrice } from "@/lib/format-price";
import { Icon } from "@/components/Icons";

const PAGE = 30;
const GREEN = "#2d6a4f";
const RED = "#c0392b";
const MUTED = "#707680";

const FILTERS = [
  ["unsure", "Αβέβαια", "Κρυμμένες: η AI δεν βεβαιώθηκε ότι είναι το ίδιο προϊόν. Αν είναι, πάτα «Ίδιο προϊόν» και η σύγκριση εμφανίζεται ξανά στους πελάτες."],
  ["different", "Διαφορετικά", "Κρυμμένες: η AI τα έκρινε διαφορετικά προϊόντα. Αν κάνει λάθος, πάτα «Ίδιο προϊόν»."],
  ["same", "Ίδια", "Εμφανίζονται στους πελάτες. Αν δεις διαφορετικά προϊόντα, πάτα «Διαφορετικό» για να κρυφτεί η σύγκριση."],
];

const VERDICT_LABEL = { same: "Ίδιο", different: "Διαφορετικό", unsure: "Αβέβαιο" };

const chainName = (id) => SUPERMARKETS.find((s) => s.id === id)?.name ?? id;

const judgeLabel = (model) => {
  if (model === "owner") return "εσύ";
  if (model === "barcode") return "barcode";
  if (model?.startsWith("claude")) return "AI (Claude)";
  return "AI (Groq)";
};

const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,()«»"']/g, "");

// Bold the words that appear in only this name — that is where a difference hides.
function NameWithDiff({ name, onlyWords }) {
  const marks = new Set((onlyWords || "").split(",").map((w) => fold(w).trim()).filter(Boolean));
  if (marks.size === 0) return <span>{name}</span>;
  return (
    <span>
      {name.split(/(\s+)/).map((part, i) =>
        marks.has(fold(part).trim())
          ? <mark key={i} style={{ background: "#fff1b8", color: "inherit", borderRadius: 3, padding: "0 2px" }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

function Side({ side, onlyWords }) {
  return (
    <a href={`/offer/${side.offerId}`} target="_blank" rel="noreferrer"
      style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 10, alignItems: "center", padding: 10, border: "1px solid #eee", borderRadius: 10, background: "#fff", color: "inherit", textDecoration: "none", minWidth: 0 }}>
      <div style={{ width: 64, height: 64, background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid #f0f0f0" }}>
        {side.imageUrl
          ? <img src={side.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <span style={{ color: "#bbb" }}><Icon.Box size={22} /></span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 2 }}>{chainName(side.chain)} · {formatPrice(side.price)}</div>
        <div style={{ fontSize: 13, lineHeight: 1.35, overflowWrap: "anywhere" }}><NameWithDiff name={side.name} onlyWords={onlyWords} /></div>
      </div>
    </a>
  );
}

export default function AdminComparisons({ showMsg }) {
  const [verdict, setVerdict] = useState("unsure");
  const [chain, setChain] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, counts: { same: 0, different: 0, unsure: 0 }, rows: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});
  const [decided, setDecided] = useState({});

  // The panel hands a new showMsg on every render; reading it through a ref
  // keeps a toast (and its clearing) from reloading the list and moving rows.
  const msgRef = useRef(showMsg);
  useEffect(() => { msgRef.current = showMsg; });
  const say = (text, type) => msgRef.current?.(text, type);

  // Only the latest request may fill the list: a slower earlier one (each
  // reads every live offer) must not overwrite a newer filter's result.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++requestSeq.current;
    setLoading(true);
    const res = await listComparisonVerdicts({ verdict, chain: chain || undefined, q: query || undefined, offset, limit: PAGE });
    if (mine !== requestSeq.current) return;
    if (res.success) setData({ total: res.total, counts: res.counts, rows: res.rows });
    else msgRef.current?.(res.error || "Αποτυχία φόρτωσης", "error");
    setLoading(false);
  }, [verdict, chain, query, offset]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQuery(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const decide = async (row, v) => {
    setBusy((b) => ({ ...b, [row.pairKey]: true }));
    const res = await setComparisonVerdict({ pairKey: row.pairKey, verdict: v });
    setBusy((b) => ({ ...b, [row.pairKey]: false }));
    if (res.success) {
      setDecided((d) => ({ ...d, [row.pairKey]: v }));
      say(v === "same" ? "Η σύγκριση εμφανίζεται στους πελάτες" : "Η σύγκριση κρύφτηκε");
    } else {
      say(res.error || "Αποτυχία", "error");
    }
  };

  const inp = { background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", color: "#1c1e24", fontSize: 13, outline: "none", fontFamily: "inherit" };
  const help = FILTERS.find(([id]) => id === verdict)?.[2];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => { setVerdict(id); setOffset(0); }}
            style={{ background: verdict === id ? "#1c1e24" : "#fff", color: verdict === id ? "#fff" : "#1c1e24", border: "1px solid #ddd", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            {label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{data.counts[id]}</span>
          </button>
        ))}
        <select value={chain} onChange={(e) => { setChain(e.target.value); setOffset(0); }} style={{ ...inp, marginLeft: "auto" }}>
          <option value="">Όλα τα καταστήματα</option>
          {SUPERMARKETS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση προϊόντος" style={{ ...inp, width: 220 }} />
      </div>

      <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px", lineHeight: 1.5 }}>
        {help} Οι λέξεις που υπάρχουν μόνο στο ένα όνομα είναι <mark style={{ background: "#fff1b8", borderRadius: 3, padding: "0 2px" }}>κίτρινες</mark>. Ο αριθμός «Τιμές σε N καταστήματα» στις κάρτες ενημερώνεται τη νύχτα.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Φόρτωση…</div>
      ) : data.rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, background: "#f8f9fa", borderRadius: 16, color: MUTED }}>Δεν υπάρχουν συγκρίσεις εδώ.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {data.rows.map((row) => {
            const now = decided[row.pairKey] ?? row.verdict;
            const mine = decided[row.pairKey] != null || row.byOwner;
            return (
              <div key={row.pairKey} style={{ padding: 12, background: mine ? "#f6fbf8" : "#fafafa", border: "1px solid #eee", borderRadius: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                  <Side side={row.a} onlyWords={row.onlyA} />
                  <Side side={row.b} onlyWords={row.onlyB} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: now === "same" ? GREEN : now === "different" ? RED : "#8a6d00" }}>
                    {VERDICT_LABEL[now]}
                  </span>
                  <span style={{ fontSize: 11, color: MUTED }}>
                    {mine ? "απόφαση: εσύ" : `κρίση: ${judgeLabel(row.model)}${row.why ? ` — ${row.why}` : ""}`}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button onClick={() => decide(row, "same")} disabled={busy[row.pairKey] || (mine && now === "same")}
                      style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", minHeight: 40, cursor: "pointer", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, opacity: mine && now === "same" ? 0.45 : 1 }}>
                      <Icon.Check size={14} /> Ίδιο προϊόν
                    </button>
                    <button onClick={() => decide(row, "different")} disabled={busy[row.pairKey] || (mine && now === "different")}
                      style={{ background: "#fff", color: RED, border: `1px solid ${RED}`, borderRadius: 8, padding: "9px 14px", minHeight: 40, cursor: "pointer", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, opacity: mine && now === "different" ? 0.45 : 1 }}>
                      <Icon.X size={14} /> Διαφορετικό
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.total > PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 18 }}>
          <button onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}
            style={{ ...inp, cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon.ChevronLeft size={14} /> Προηγούμενες
          </button>
          <span style={{ fontSize: 12, color: MUTED }}>{offset + 1}–{Math.min(offset + PAGE, data.total)} από {data.total}</span>
          <button onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= data.total}
            style={{ ...inp, cursor: offset + PAGE >= data.total ? "default" : "pointer", opacity: offset + PAGE >= data.total ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 4 }}>
            Επόμενες <Icon.ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
