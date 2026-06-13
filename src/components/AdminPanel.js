'use client';

import { useState, useEffect, useCallback } from "react";
import { verifyAdminPassword, logoutAdmin } from "@/actions/verify-admin";
import { getProducts } from "@/actions/get-products";
import { listDiscounts } from "@/actions/admin/list-discounts";
import { deleteDiscount } from "@/actions/admin/delete-discount";
import { createDiscount } from "@/actions/admin/create-discount";
import { createLeaflet, listLeaflets, deleteLeaflet } from "@/actions/admin/leaflet-actions";
import { getStats } from "@/actions/admin/get-stats";
import { getSubscribers } from "@/actions/admin/get-subscribers";
import { listPendingMatches } from "@/actions/admin/list-pending-matches";
import { approvePendingMatch } from "@/actions/admin/approve-pending-match";
import { rejectPendingMatch } from "@/actions/admin/reject-pending-match";
import { createSkuFromPending } from "@/actions/admin/create-sku-from-pending";
import { bulkRejectPendingMatches } from "@/actions/admin/bulk-reject-pending-matches";
import { bulkApprovePendingMatches } from "@/actions/admin/bulk-approve-pending-matches";
import { setFeatured } from "@/actions/admin/set-featured";
import { getIngestHealth } from "@/actions/admin/get-ingest-health";
import { SUPERMARKETS, CATEGORIES } from "@/lib/constants";

const emptyLeafletForm = {
  supermarket: "ab",
  title: "",
  validFrom: "",
  validUntil: "",
  pdfUrl: "",
  autoDeleteDays: "10",
};

const normalize = (s) => {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const G = {
  blue: "#009de0",
  red: "#ff3b30",
  muted: "#707680",
  text: "#1c1e24"
};

export function AdminAuth({ onAuth }) {
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    const res = await verifyAdminPassword(pass);
    if (res.success) onAuth();
    else setError(res.error);
    setLoading(false);
  };

  const inp = { background: "#f9fafb", border: "1px solid #ddd", borderRadius: 10, padding: "10px 14px", color: "#1c1e24", fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <form onSubmit={handleLogin} style={{ background: "#fff", padding: 40, borderRadius: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <h2 style={{ margin: 0 }}>Admin Login</h2>
        </div>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Κωδικός Πρόσβασης" style={{ ...inp, marginBottom: 20 }} />
        {error && <div style={{ color: G.red, fontSize: 12, marginBottom: 20, textAlign: "center" }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ background: G.blue, color: "#fff", border: "none", width: "100%", padding: 14, borderRadius: 12, fontWeight: 700 }}>{loading ? "Είσοδος..." : "Είσοδος"}</button>
      </form>
    </div>
  );
}

const PAGE_SIZE = 50;
const emptyForm = {
  supermarket: "ab",
  product_name: "",
  category: "Άλλο",
  original_price: "",
  discounted_price: "",
  discount_percent: "",
  description: "",
  valid_from: "",
  valid_until: "",
  image_url: "",
  is_active: true,
  is_featured: false,
  featured_until: "",
  featured_label: "",
};

export function AdminPanel({ onBack }) {
  const [discounts, setDiscounts] = useState([]);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [discountOffset, setDiscountOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [productTotal, setProductTotal] = useState(0);
  const [libSearch, setLibSearch] = useState("");
  const [libSM, setLibSM] = useState("all");
  const [libLoading, setLibLoading] = useState(false);
  const [libOffset, setLibOffset] = useState(0);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [search, setSearch] = useState("");
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [leaflets, setLeaflets] = useState([]);
  const [leafletForm, setLeafletForm] = useState(emptyLeafletForm);
  const [leafletSaving, setLeafletSaving] = useState(false);
  const [stats, setStats] = useState({ last30: [], last7: [] });
  const [statsLoading, setStatsLoading] = useState(false);
  const [subs, setSubs] = useState({ counts: { total: 0, confirmed: 0, pending: 0, unsubscribed: 0 }, list: [] });
  const [subsLoading, setSubsLoading] = useState(false);
  const [pending, setPending] = useState({ total: 0, rows: [] });
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingRowState, setPendingRowState] = useState({});
  const [pendingFilterSM, setPendingFilterSM] = useState("masoutis");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMinConf, setBulkMinConf] = useState(90);
  const [productDetail, setProductDetail] = useState(null);
  const [health, setHealth] = useState({ feeds: [], recentRuns: [], coverage: null });
  const [healthLoading, setHealthLoading] = useState(false);

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3500);
  };

  const loadList = useCallback(async (reset = false) => {
    setListLoading(true);
    try {
      const nextOffset = reset ? 0 : discountOffset;
      const res = await listDiscounts({ limit: PAGE_SIZE, offset: nextOffset, search, isFeatured: filterFeatured });
      setDiscountTotal(res.total || 0);
      const fetched = res.discounts || [];
      setDiscounts(reset ? fetched : (prev) => [...prev, ...fetched]);
      setDiscountOffset(nextOffset + fetched.length);
    } catch (e) {
      showMsg("Failed to load: " + (e?.message || "unknown"), "error");
    }
    setListLoading(false);
  }, [discountOffset, search]);

  const loadLibrary = async (reset = false) => {
    setLibLoading(true);
    try {
      const nextOffset = reset ? 0 : libOffset;
      const result = await getProducts({ search: libSearch, supermarket: libSM, limit: PAGE_SIZE, offset: nextOffset });
      const fetched = result.products || [];
      setProducts(reset ? fetched : (prev) => [...prev, ...fetched]);
      setProductTotal(result.total || 0);
      setLibOffset(nextOffset + fetched.length);
    } catch (e) {
      showMsg("Failed to load products", "error");
    }
    setLibLoading(false);
  };

  useEffect(() => {
    if (tab === "lib") loadLibrary(true);
  }, [tab, libSearch, libSM]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLeaflets = async () => {
    const res = await listLeaflets();
    if (res.success) setLeaflets(res.leaflets);
    else showMsg(res.error || "Failed to load leaflets", "error");
  };

  const loadStats = async () => {
    setStatsLoading(true);
    const res = await getStats();
    if (res.success) setStats({ last30: res.last30, last7: res.last7 });
    else showMsg(res.error || "Failed to load stats", "error");
    setStatsLoading(false);
  };

  const loadSubscribers = async () => {
    setSubsLoading(true);
    const res = await getSubscribers();
    if (res.success) setSubs({ counts: res.counts, list: res.subscribers });
    else showMsg(res.error || "Failed to load subscribers", "error");
    setSubsLoading(false);
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    const res = await getIngestHealth();
    if (res.success) setHealth({ feeds: res.feeds, recentRuns: res.recentRuns, coverage: res.coverage });
    else showMsg(res.error || "Failed to load pipeline health", "error");
    setHealthLoading(false);
  };

  const loadPending = async () => {
    setPendingLoading(true);
    const res = await listPendingMatches({ supermarket: pendingFilterSM === "all" ? undefined : pendingFilterSM });
    if (res.success) {
      setPending({ total: res.total, rows: res.rows });
      const init = {};
      res.rows.forEach((r) => { init[r.id] = { category: "Άλλο", busy: false }; });
      setPendingRowState(init);
    } else {
      showMsg(res.error || "Failed to load review queue", "error");
    }
    setPendingLoading(false);
  };

  const handleApprove = async (row) => {
    if (!row.suggestedProduct) return;
    const state = pendingRowState[row.id] || {};
    setPendingRowState((s) => ({ ...s, [row.id]: { ...state, busy: true } }));
    const res = await approvePendingMatch({
      pendingMatchId: row.id,
      productId: row.suggestedProduct.id,
      category: state.category || "Άλλο",
    });
    if (res.success) {
      showMsg("✓ Approved");
      setPending((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== row.id), total: Math.max(0, p.total - 1) }));
    } else {
      showMsg(res.error || "Approve failed", "error");
      setPendingRowState((s) => ({ ...s, [row.id]: { ...state, busy: false } }));
    }
  };

  const handleReject = async (row) => {
    if (!window.confirm("Απόρριψη αυτής της γραμμής;")) return;
    const res = await rejectPendingMatch({ pendingMatchId: row.id });
    if (res.success) {
      showMsg("Απορρίφθηκε");
      setPending((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== row.id), total: Math.max(0, p.total - 1) }));
    } else {
      showMsg(res.error || "Reject failed", "error");
    }
  };

  const handleBulkReject = async () => {
    if (pendingFilterSM === "all") { showMsg("Διάλεξε ένα supermarket πρώτα", "error"); return; }
    if (!window.confirm(`Διαγραφή ΟΛΩΝ των γραμμών (~${pending.total}) στο queue του ${pendingFilterSM};`)) return;
    setBulkBusy(true);
    const res = await bulkRejectPendingMatches({ supermarket: pendingFilterSM });
    setBulkBusy(false);
    if (res.success) {
      showMsg(`Απορρίφθηκαν ${res.rejected} γραμμές (απομένουν ${res.remaining})`);
      loadPending();
    } else {
      showMsg(res.error || "Bulk reject failed", "error");
    }
  };

  const handleBulkApprove = async () => {
    if (pendingFilterSM === "all") { showMsg("Διάλεξε ένα supermarket πρώτα", "error"); return; }
    const conf = Number(bulkMinConf);
    if (!Number.isFinite(conf) || conf < 50 || conf > 100) { showMsg("Confidence 50–100", "error"); return; }
    if (!window.confirm(`Approve όλες τις γραμμές του ${pendingFilterSM} με aiConfidence ≥ ${conf}%;`)) return;
    setBulkBusy(true);
    const res = await bulkApprovePendingMatches({ supermarket: pendingFilterSM, minConfidence: conf });
    setBulkBusy(false);
    if (res.success) {
      showMsg(`✓ Approved ${res.approved} · skipped ${res.skipped} · remaining ${res.remaining}`);
      loadPending();
    } else {
      showMsg(res.error || "Bulk approve failed", "error");
    }
  };

  const handleCreateSku = async (row) => {
    const state = pendingRowState[row.id] || {};
    if (!row.rawImageUrl) { showMsg("Δεν υπάρχει εικόνα — δεν μπορεί να δημιουργηθεί SKU", "error"); return; }
    setPendingRowState((s) => ({ ...s, [row.id]: { ...state, busy: true } }));
    const res = await createSkuFromPending({
      pendingMatchId: row.id,
      category: state.category || "Άλλο",
    });
    if (res.success) {
      showMsg("✓ Νέο SKU δημιουργήθηκε");
      setPending((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== row.id), total: Math.max(0, p.total - 1) }));
    } else {
      showMsg(res.error || "Create failed", "error");
      setPendingRowState((s) => ({ ...s, [row.id]: { ...state, busy: false } }));
    }
  };

  useEffect(() => {
    if (tab === "leaf") loadLeaflets();
    if (tab === "stats") loadStats();
    if (tab === "subs") loadSubscribers();
    if (tab === "review") loadPending();
    if (tab === "health") loadHealth();
  }, [tab]);

  useEffect(() => {
    if (tab === "review") loadPending();
  }, [pendingFilterSM]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLeaflet = async () => {
    if (!leafletForm.pdfUrl.trim()) {
      showMsg("Βάλε το PDF URL.", "error"); return;
    }
    setLeafletSaving(true);
    const isDateless = !leafletForm.validFrom && !leafletForm.validUntil;
    const autoDays = leafletForm.autoDeleteDays ? parseInt(leafletForm.autoDeleteDays, 10) : null;
    const res = await createLeaflet({
      supermarket: leafletForm.supermarket,
      title: leafletForm.title || undefined,
      validFrom: leafletForm.validFrom || undefined,
      validUntil: leafletForm.validUntil || undefined,
      pdfUrl: leafletForm.pdfUrl,
      autoDeleteDays: isDateless && autoDays && autoDays > 0 ? autoDays : null,
    });
    if (res.success) {
      showMsg("✓ Φυλλάδιο αποθηκεύτηκε!");
      setLeafletForm(emptyLeafletForm);
      loadLeaflets();
    } else {
      showMsg(res.error || "Save failed", "error");
    }
    setLeafletSaving(false);
  };

  const handleDeleteLeaflet = async (id) => {
    if (!window.confirm("Να διαγραφεί το φυλλάδιο;")) return;
    const res = await deleteLeaflet(id);
    if (res.success) { showMsg("Διαγράφηκε."); loadLeaflets(); }
    else showMsg(res.error || "Delete failed", "error");
  };

  useEffect(() => {
    loadList(true);
  }, [filterFeatured]);

  useEffect(() => {
    const t = setTimeout(() => loadList(true), 250);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDiscount = async () => {
    if (!form.product_name.trim()) { showMsg("Συμπλήρωσε το όνομα προϊόντος.", "error"); return; }
    if (!form.discounted_price) { showMsg("Βάλε τιμή προσφοράς.", "error"); return; }
    setSaving(true);
    const res = await createDiscount(form);
    if (res.success) {
      showMsg("✓ Η προσφορά αποθηκεύτηκε!");
      setForm(emptyForm);
      loadList(true);
    } else {
      showMsg(res.error || "Save failed", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Να διαγραφεί;")) return;
    const res = await deleteDiscount(id);
    if (res.success) {
      showMsg("Διαγράφηκε.");
      loadList(true);
    } else {
      showMsg(res.error || "Delete failed", "error");
    }
  };

  const handleToggleFeatured = async (d) => {
    const willFeature = !d.isFeatured;
    let durationDays = 7;
    let label = null;
    if (willFeature) {
      const input = window.prompt("Διάρκεια προβολής σε ημέρες (1-60):", "7");
      if (input === null) return;
      const parsed = parseInt(input, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
        showMsg("Μη έγκυρη διάρκεια", "error");
        return;
      }
      durationDays = parsed;
      const labelInput = window.prompt("Προαιρετικό label (π.χ. 'Sponsored', 'Top pick') — άφησε κενό για κανένα:", "");
      label = labelInput?.trim() || null;
    }
    const res = await setFeatured({ discountId: d.id, featured: willFeature, durationDays, label: label ?? undefined });
    if (res.success) {
      showMsg(willFeature ? `Featured για ${durationDays} ημέρες.` : "Αφαιρέθηκε από featured.");
      loadList(true);
    } else {
      showMsg(res.error || "Featured toggle failed", "error");
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    onBack();
  };

  const inp = { background: "#fff", border: `1px solid #ddd`, borderRadius: 10, padding: "10px 14px", color: "#1c1e24", fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" };
  const lbl = { color: "#707680", fontSize: 11, fontWeight: 700, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };
  const filteredList = discounts.filter((d) => !search || normalize(d.productName || "").includes(normalize(search)));

  const renderStatsTable = () => {
    if (statsLoading) return <div style={{ textAlign: "center", padding: 40 }}>⏳ Φόρτωση στατιστικών...</div>;
    
    const smStats = {};
    SUPERMARKETS.forEach(sm => {
      smStats[sm.id] = { 
        name: sm.name,
        d7: { deal_click: 0, leaflet_click: 0, list_add: 0 },
        d30: { deal_click: 0, leaflet_click: 0, list_add: 0 }
      };
    });

    stats.last7.forEach(r => {
      if (smStats[r.supermarket]) smStats[r.supermarket].d7[r.eventType] = r._count._all;
    });
    stats.last30.forEach(r => {
      if (smStats[r.supermarket]) smStats[r.supermarket].d30[r.eventType] = r._count._all;
    });

    const sortedSms = Object.values(smStats).sort((a, b) => b.d30.deal_click - a.d30.deal_click);

    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f8f9fa", textAlign: "left" }}>
            <tr>
              <th style={{ padding: 12 }}>Supermarket</th>
              <th style={{ padding: 12, textAlign: "center" }} colSpan={3}>Τελευταίες 7 ημέρες</th>
              <th style={{ padding: 12, textAlign: "center" }} colSpan={3}>Τελευταίες 30 ημέρες</th>
            </tr>
            <tr style={{ fontSize: 10, background: "#f1f3f5" }}>
              <th style={{ padding: "4px 12px" }}></th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>Deals</th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>Leaflets</th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>List</th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>Deals</th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>Leaflets</th>
              <th style={{ padding: "4px 12px", textAlign: "center" }}>List</th>
            </tr>
          </thead>
          <tbody>
            {sortedSms.map(sm => (
              <tr key={sm.name} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: 12, fontWeight: 700 }}>{sm.name}</td>
                <td style={{ padding: 12, textAlign: "center" }}>{sm.d7.deal_click}</td>
                <td style={{ padding: 12, textAlign: "center" }}>{sm.d7.leaflet_click}</td>
                <td style={{ padding: 12, textAlign: "center" }}>{sm.d7.list_add}</td>
                <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{sm.d30.deal_click}</td>
                <td style={{ padding: 12, textAlign: "center" }}>{sm.d30.leaflet_click}</td>
                <td style={{ padding: 12, textAlign: "center" }}>{sm.d30.list_add}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderHealthTab = () => {
    if (healthLoading) return <div style={{ textAlign: "center", padding: 40 }}>⏳ Φόρτωση υγείας pipeline...</div>;

    const STATUS = {
      ok: { label: "OK", bg: "#e8f7ee", fg: "#1b7a43" },
      warn: { label: "Προσοχή", bg: "#fff4e0", fg: "#8a5a00" },
      stale: { label: "Νεκρό", bg: "#ffe9e7", fg: "#a82317" },
      never: { label: "Δεν έτρεξε ποτέ", bg: "#f0f1f3", fg: "#707680" },
    };
    const timeAgo = (d) => {
      if (!d) return "—";
      const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
      if (mins < 60) return `πριν ${mins}λ`;
      if (mins < 48 * 60) return `πριν ${Math.round(mins / 60)}ω`;
      return `πριν ${Math.round(mins / 1440)}μ`;
    };
    const pill = (status) => {
      const s = STATUS[status] || STATUS.never;
      return <span style={{ background: s.bg, color: s.fg, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{s.label}</span>;
    };
    const modePill = (mode) => {
      if (mode === "full-catalog-baseline") {
        return <span style={{ background: "#e8f7ee", color: "#1b7a43", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>FULL CATALOG</span>;
      }
      if (mode === "offers-only") {
        return <span style={{ background: "#fff4e0", color: "#8a5a00", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>OFFERS ONLY</span>;
      }
      return <span style={{ background: "#ffe9e7", color: "#a82317", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>MISSING</span>;
    };
    const fmt = (n) => Number(n || 0).toLocaleString("el-GR");
    const th = { padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" };
    const td = { padding: "8px 10px", whiteSpace: "nowrap" };
    const coverage = health.coverage;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: G.muted }}>
            Ένα feed ανά (αλυσίδα, πηγή). «Νεκρό» = καμία υγιής εκτέλεση μέσα στο όριό του — έλεγξε τον adapter.
          </div>
          <button onClick={loadHealth} style={{ marginLeft: "auto", background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>🔄 RELOAD</button>
        </div>

        {coverage && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              {[
                ["Προϊόντα", fmt(coverage.totals.products)],
                ["Με εικόνα", fmt(coverage.totals.productsWithImage)],
                ["Με GTIN", fmt(coverage.totals.productsWithBarcode)],
                ["Ενεργές προσφορές", fmt(coverage.totals.activeOffers)],
                ["Linked offers", `${fmt(coverage.totals.linkedActiveOffers)} (${coverage.totals.linkedOfferRate}%)`],
                ["Unlinked offers", fmt(coverage.totals.unlinkedActiveOffers)],
                ["Pending review", fmt(coverage.totals.pendingMatches)],
                ["Shelf baseline", fmt(coverage.totals.normalBaselineRows)],
              ].map(([label, value]) => (
                <div key={label} style={{ border: "1px solid #ececf0", borderRadius: 10, padding: 12, background: "#fff" }}>
                  <div style={{ fontSize: 11, color: G.muted, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Κάλυψη καταλόγου ανά supermarket</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#f8f9fa" }}>
                  <tr>
                    <th style={th}>Chain</th>
                    <th style={th}>Mode</th>
                    <th style={{ ...th, textAlign: "right" }}>Active offers</th>
                    <th style={{ ...th, textAlign: "right" }}>Linked</th>
                    <th style={{ ...th, textAlign: "right" }}>Unlinked</th>
                    <th style={{ ...th, textAlign: "right" }}>Pending</th>
                    <th style={{ ...th, textAlign: "right" }}>Mapped products</th>
                    <th style={{ ...th, textAlign: "right" }}>Source products</th>
                    <th style={{ ...th, textAlign: "right" }}>GTIN products</th>
                    <th style={{ ...th, textAlign: "right" }}>Baseline products</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.chains.map((c) => (
                    <tr key={c.chain} style={{ borderTop: "1px solid #eee", background: c.unlinkedActiveOffers > 0 ? "#fffdf8" : "transparent" }}>
                      <td style={{ ...td, fontWeight: 800 }}>{c.chain}</td>
                      <td style={td}>{modePill(c.mode)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.activeOffers)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.linkedActiveOffers)} <span style={{ color: G.muted }}>({c.linkedOfferRate}%)</span></td>
                      <td style={{ ...td, textAlign: "right", color: c.unlinkedActiveOffers > 0 ? "#8a5a00" : "inherit", fontWeight: c.unlinkedActiveOffers > 0 ? 800 : 400 }}>{fmt(c.unlinkedActiveOffers)}</td>
                      <td style={{ ...td, textAlign: "right", color: c.pendingMatches > 0 ? "#8a5a00" : "inherit", fontWeight: c.pendingMatches > 0 ? 800 : 400 }}>{fmt(c.pendingMatches)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.mappedProducts)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.sourceProducts)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.sourceProductsWithBarcode)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.normalBaselineProducts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#f8f9fa" }}>
              <tr>
                <th style={th}>Feed</th>
                <th style={th}>Κατάσταση</th>
                <th style={th}>Τελευταίο run</th>
                <th style={{ ...th, textAlign: "right" }}>Items</th>
                <th style={{ ...th, textAlign: "right" }}>Matched</th>
                <th style={{ ...th, textAlign: "right" }}>Review</th>
                <th style={{ ...th, textAlign: "right" }}>Αλλαγές τιμών</th>
                <th style={th}>Πρόγραμμα</th>
              </tr>
            </thead>
            <tbody>
              {health.feeds.map((f) => (
                <tr key={`${f.spec.chain}/${f.spec.source}`} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ ...td, fontWeight: 700 }}>{f.spec.chain} <span style={{ color: G.muted, fontWeight: 400 }}>/ {f.spec.source}</span></td>
                  <td style={td}>{pill(f.status)}</td>
                  <td style={td} title={f.lastRun ? new Date(f.lastRun.finishedAt).toLocaleString("el-GR") : ""}>{timeAgo(f.lastRun?.finishedAt)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f.lastRun ? f.lastRun.scrapedItems : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f.lastRun ? f.lastRun.matched : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f.lastRun ? f.lastRun.reviewQueued : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{f.lastRun ? f.lastRun.priceChanges : "—"}</td>
                  <td style={{ ...td, fontSize: 11, color: G.muted }}>{f.spec.schedule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Ιστορικό εκτελέσεων</div>
        {health.recentRuns.length === 0 ? (
          <div style={{ color: G.muted, fontSize: 12, padding: "12px 0" }}>
            Καμία εκτέλεση καταγεγραμμένη ακόμα — οι γραμμές εμφανίζονται μόλις τρέξει ο πρώτος adapter μετά το deploy αυτής της λειτουργίας.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f8f9fa" }}>
                <tr>
                  <th style={th}>Πότε</th>
                  <th style={th}>Feed</th>
                  <th style={th}>Υγεία</th>
                  <th style={{ ...th, textAlign: "right" }}>Items</th>
                  <th style={{ ...th, textAlign: "right" }}>Matched</th>
                  <th style={{ ...th, textAlign: "right" }}>Review</th>
                  <th style={{ ...th, textAlign: "right" }}>Αλλαγές</th>
                  <th style={{ ...th, textAlign: "right" }}>Απενεργ.</th>
                  <th style={{ ...th, textAlign: "right" }}>Σφάλματα</th>
                  <th style={th}>Σημειώσεις</th>
                </tr>
              </thead>
              <tbody>
                {health.recentRuns.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eee", background: r.healthOk ? "transparent" : "#fff8f0" }}>
                    <td style={td} title={new Date(r.finishedAt).toLocaleString("el-GR")}>{timeAgo(r.finishedAt)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.chain} <span style={{ color: G.muted, fontWeight: 400 }}>/ {r.source}</span></td>
                    <td style={td}>{r.healthOk ? "✅" : "⚠️"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.scrapedItems}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.matched}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.reviewQueued}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.priceChanges}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.deactivated}</td>
                    <td style={{ ...td, textAlign: "right", color: r.errors > 0 ? G.red : "inherit", fontWeight: r.errors > 0 ? 700 : 400 }}>{r.errors}</td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 320, fontSize: 11, color: G.muted }}>{(r.warnings || []).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderSubsTable = () => {
    if (subsLoading) return <div style={{ textAlign: "center", padding: 40 }}>⏳ Φόρτωση συνδρομητών...</div>;
    
    const exportCSV = () => {
      const headers = ["Email", "Source", "Created", "Confirmed", "Unsubscribed"];
      const rows = subs.list.map(s => [s.email, s.source || "", s.createdAt, s.confirmedAt || "", s.unsubscribedAt || ""]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `subscribers_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 15, marginBottom: 24 }}>
          {[
            ["Σύνολο", subs.counts.total],
            ["Επιβεβαιωμένοι", subs.counts.confirmed],
            ["Σε εκκρεμότητα", subs.counts.pending],
            ["Απεγγραφές", subs.counts.unsubscribed]
          ].map(([label, count]) => (
            <div key={label} style={{ background: "#f8f9fa", padding: 16, borderRadius: 12, textAlign: "center", border: "1px solid #eee" }}>
              <div style={lbl}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{count}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Πρόσφατες εγγραφές</h3>
          <button onClick={exportCSV} style={{ background: "#1c1e24", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            📥 EXPORT CSV
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f8f9fa", textAlign: "left" }}>
              <tr>
                <th style={{ padding: 10 }}>Email</th>
                <th style={{ padding: 10 }}>Πηγή</th>
                <th style={{ padding: 10 }}>Ημ. Εγγραφής</th>
                <th style={{ padding: 10 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.list.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: G.muted }}>Κανένας συνδρομητής.</td></tr>
              )}
              {subs.list.map(s => (
                <tr key={s.email} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 10, fontWeight: 600 }}>{s.email}</td>
                  <td style={{ padding: 10 }}>{s.source || "—"}</td>
                  <td style={{ padding: 10 }}>{s.createdAt.slice(0, 10)}</td>
                  <td style={{ padding: 10 }}>
                    {s.unsubscribedAt ? <span style={{ color: G.red, fontWeight: 700 }}>Unsubscribed</span> : 
                     s.confirmedAt ? <span style={{ color: "#2d6a4f", fontWeight: 700 }}>Confirmed</span> : 
                     <span style={{ color: "#e07b00", fontWeight: 700 }}>Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>⚙️ Admin Panel</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleLogout} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>Logout</button>
            <button onClick={onBack} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>← Back to Site</button>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #ddd", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f8f9fa", borderRadius: 12, padding: 5, width: "fit-content", border: "1px solid #eee" }}>
            {[["list", `📋 Λίστα`], ["lib", "📚 Library"], ["leaf", "📖 Φυλλάδια"], ["review", "🧐 Review"], ["health", "🩺 Υγεία"], ["stats", "📊 Αναλυτικά"], ["subs", "📧 Συνδρομητές"], ["add", "➕ Νέα"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ background: tab === id ? "#1c1e24" : "transparent", color: tab === id ? "#fff" : "#707680", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "review" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <select value={pendingFilterSM} onChange={(e) => setPendingFilterSM(e.target.value)} style={{ ...inp, maxWidth: 200 }}>
                  <option value="all">Όλα τα supermarkets</option>
                  {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                </select>
                <button onClick={loadPending} style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>🔄 RELOAD</button>
                <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: G.muted }}>{pending.total} σε εκκρεμότητα</div>
              </div>

              {pendingFilterSM !== "all" && pending.total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff8f0", border: "1px solid #ffd8a8", borderRadius: 10, marginBottom: 18, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8a4b00" }}>Μαζικά για {pendingFilterSM}:</span>
                  <label style={{ fontSize: 11, color: G.muted, display: "flex", alignItems: "center", gap: 6 }}>
                    Approve με conf ≥
                    <input
                      type="number"
                      min={50}
                      max={100}
                      step={1}
                      value={bulkMinConf}
                      onChange={(e) => setBulkMinConf(Number(e.target.value) || 0)}
                      style={{ ...inp, width: 60, padding: "4px 6px", fontSize: 11 }}
                    />
                    %
                  </label>
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkBusy}
                    style={{ background: "#2d6a4f", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: bulkBusy ? "wait" : "pointer", fontWeight: 700, fontSize: 11 }}
                  >
                    {bulkBusy ? "..." : "✓ Bulk approve"}
                  </button>
                  <button
                    onClick={handleBulkReject}
                    disabled={bulkBusy}
                    style={{ background: "#fff", border: `1px solid ${G.red}`, color: G.red, borderRadius: 8, padding: "6px 12px", cursor: bulkBusy ? "wait" : "pointer", fontWeight: 700, fontSize: 11, marginLeft: "auto" }}
                  >
                    ✗ Reject all ({pending.total})
                  </button>
                </div>
              )}

              {pendingLoading ? (
                <div style={{ textAlign: "center", padding: 40 }}>⏳ Φόρτωση...</div>
              ) : pending.rows.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, background: "#f8f9fa", borderRadius: 16, color: G.muted }}>✅ Καμία εκκρεμότητα.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {pending.rows.map((row) => {
                    const state = pendingRowState[row.id] || { category: "Άλλο", busy: false };
                    const canApprove = !!row.suggestedProduct;
                    const canCreateSku = !canApprove && !!row.rawImageUrl;
                    const displayImg = row.suggestedProduct?.imageUrl || row.rawImageUrl;
                    return (
                      <div key={row.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 14, alignItems: "center", padding: 12, background: "#fff", border: "1px solid #eee", borderRadius: 12 }}>
                        <div style={{ width: 60, height: 60, background: "#f8f9fa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {displayImg && <img src={displayImg} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{row.rawName}</div>
                          <div style={{ fontSize: 11, color: G.muted }}>
                            {row.rawPrice}€ · {row.supermarket} · AI {Math.round(row.aiConfidence)}%
                          </div>
                          <div style={{ fontSize: 11, color: canApprove ? "#2d6a4f" : G.red, marginTop: 4 }}>
                            {canApprove
                              ? `→ ${row.suggestedProduct.name}`
                              : canCreateSku
                                ? "❌ Καμία αντιστοιχία — δημιούργησε νέο SKU"
                                : "❌ Καμία αντιστοιχία και χωρίς εικόνα"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {(canApprove || canCreateSku) && (
                            <select
                              value={state.category}
                              onChange={(e) => setPendingRowState((s) => ({ ...s, [row.id]: { ...state, category: e.target.value } }))}
                              style={{ ...inp, width: 180, padding: "6px 8px", fontSize: 12 }}
                            >
                              {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          )}
                          {canApprove && (
                            <button
                              onClick={() => handleApprove(row)}
                              disabled={state.busy}
                              style={{ background: "#2d6a4f", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                            >
                              {state.busy ? "..." : "✓ Approve"}
                            </button>
                          )}
                          {canCreateSku && (
                            <button
                              onClick={() => handleCreateSku(row)}
                              disabled={state.busy}
                              style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                            >
                              {state.busy ? "..." : "🌟 Create SKU"}
                            </button>
                          )}
                          <button
                            onClick={() => handleReject(row)}
                            style={{ background: "#fff", border: `1px solid ${G.red}`, color: G.red, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                          >
                            ✗ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "health" && renderHealthTab()}

          {tab === "stats" && renderStatsTable()}

          {tab === "subs" && renderSubsTable()}

          {tab === "leaf" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 24, padding: 16, background: "#f8f9fa", borderRadius: 12 }}>
                <div>
                  <label style={lbl}>Supermarket</label>
                  <select value={leafletForm.supermarket} onChange={e => setLeafletForm({ ...leafletForm, supermarket: e.target.value })} style={inp}>
                    {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                  </select>
                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Τίτλος (προαιρετικό)</label>
                    <input value={leafletForm.title} onChange={e => setLeafletForm({ ...leafletForm, title: e.target.value })} style={inp} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>PDF URL</label>
                    <input value={leafletForm.pdfUrl} onChange={e => setLeafletForm({ ...leafletForm, pdfUrl: e.target.value })} placeholder="https://…" style={inp} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Valid From</label>
                  <input type="date" value={leafletForm.validFrom} onChange={e => setLeafletForm({ ...leafletForm, validFrom: e.target.value })} style={inp} />
                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Valid Until</label>
                    <input type="date" value={leafletForm.validUntil} onChange={e => setLeafletForm({ ...leafletForm, validUntil: e.target.value })} style={inp} />
                  </div>
                  {!leafletForm.validFrom && !leafletForm.validUntil && (
                    <div style={{ marginTop: 12 }}>
                      <label style={lbl}>Αυτόματη διαγραφή μετά από (ημέρες)</label>
                      <input type="number" min="1" value={leafletForm.autoDeleteDays} onChange={e => setLeafletForm({ ...leafletForm, autoDeleteDays: e.target.value })} placeholder="άδειο = ποτέ" style={inp} />
                    </div>
                  )}
                  <button onClick={saveLeaflet} disabled={leafletSaving} style={{ marginTop: 20, background: G.blue, color: "#fff", padding: 12, width: "100%", borderRadius: 12, border: "none", fontWeight: 700 }}>
                    {leafletSaving ? "Saving..." : "Save Leaflet"}
                  </button>
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#f8f9fa", textAlign: "left" }}>
                  <tr>
                    <th style={{ padding: 12 }}>Store</th>
                    <th style={{ padding: 12 }}>Title</th>
                    <th style={{ padding: 12 }}>Valid</th>
                    <th style={{ padding: 12 }}>PDF</th>
                    <th style={{ padding: 12 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {leaflets.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: G.muted }}>Κανένα φυλλάδιο.</td></tr>
                  )}
                  {leaflets.map(l => (
                    <tr key={l.id} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: 12 }}>{l.storeName}</td>
                      <td style={{ padding: 12 }}>{l.title || "—"}</td>
                      <td style={{ padding: 12, fontSize: 11 }}>{l.validFrom ? `${l.validFrom.slice(0, 10)} → ${l.validUntil ? l.validUntil.slice(0, 10) : "—"}` : (() => {
                        if (!l.autoDeleteDays) return "χωρίς ημερομηνίες";
                        const created = new Date(l.createdAt).getTime();
                        const remaining = Math.ceil((created + l.autoDeleteDays * 86400000 - Date.now()) / 86400000);
                        return `χωρίς ημ. · αυτο-διαγραφή σε ${Math.max(0, remaining)} ημ.`;
                      })()}</td>
                      <td style={{ padding: 12 }}>{l.pdfUrl ? <a href={l.pdfUrl} target="_blank" rel="noreferrer" style={{ color: G.blue }}>PDF ↗</a> : "—"}</td>
                      <td style={{ padding: 12 }}>
                        <button onClick={() => handleDeleteLeaflet(l.id)} style={{ color: G.red, background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "lib" && (
            <div>
              <div style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
                <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="🔍 Search library..." style={{ ...inp, maxWidth: 300 }} />
                <select value={libSM} onChange={(e) => setLibSM(e.target.value)} style={{ ...inp, maxWidth: 160 }}>
                  <option value="all">All Stores</option>
                  {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                </select>
                <button onClick={() => loadLibrary(true)} style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>🔄 LOAD PRODUCTS</button>
                <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: G.muted }}>{products.length} of {productTotal}</div>
              </div>
              {libLoading && products.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, background: "#f8f9fa", borderRadius: 16 }}>⏳ Fetching products...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                    {products.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#888" }}>No products found in database.</div>}
                    {products.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setProductDetail(p)}
                        style={{ background: "#fff", borderRadius: 12, padding: 10, border: "1px solid #eee", textAlign: "center", cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                      >
                        <div style={{ aspectRatio: "1/1", background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                          {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} />}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, height: "2.4em", overflow: "hidden", lineHeight: 1.2 }}>{p.name}</div>
                      </div>
                    ))}
                  </div>
                  {products.length < productTotal && (
                    <div style={{ textAlign: "center", marginTop: 18 }}>
                      <button onClick={() => loadLibrary(false)} disabled={libLoading} style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: libLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, opacity: libLoading ? 0.6 : 1 }}>
                        {libLoading ? "⏳ Loading..." : `Φόρτωσε κι άλλα (${productTotal - products.length} ακόμα)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "list" && (
            <div>
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search active offers..." style={{ ...inp, maxWidth: 320 }} />
                <label style={{ fontSize: 13, fontWeight: 700, color: G.muted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={filterFeatured} onChange={e => setFilterFeatured(e.target.checked)} />
                  Μόνο προβεβλημένες
                </label>
                <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: G.muted }}>{discountTotal} total</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f8f9fa", textAlign: "left" }}>
                    <tr>
                      <th style={{ padding: 12 }}>Product</th>
                      <th style={{ padding: 12 }}>Category</th>
                      <th style={{ padding: 12 }}>Price</th>
                      <th style={{ padding: 12 }}>Store</th>
                      <th style={{ padding: 12 }}>Featured</th>
                      <th style={{ padding: 12 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map(d => {
                      const featuredActive = d.isFeatured && (!d.featuredUntil || new Date(d.featuredUntil) > new Date());
                      return (
                        <tr key={d.id} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: 12 }}>{d.productName}</td>
                          <td style={{ padding: 12 }}>{d.category}</td>
                          <td style={{ padding: 12 }}>{d.discountedPrice}€</td>
                          <td style={{ padding: 12 }}>{d.supermarket}</td>
                          <td style={{ padding: 12 }}>
                            <button
                              onClick={() => handleToggleFeatured(d)}
                              title={featuredActive && d.featuredUntil ? `έως ${new Date(d.featuredUntil).toLocaleDateString('el-GR')}` : ''}
                              style={{
                                background: featuredActive ? "#ffd60a" : "transparent",
                                color: featuredActive ? "#1c1e24" : G.muted,
                                border: featuredActive ? "1px solid #f5b800" : "1px solid #ddd",
                                borderRadius: 6,
                                padding: "4px 10px",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              {featuredActive ? `⭐ ${d.featuredLabel || 'Featured'}` : "☆ Feature"}
                            </button>
                          </td>
                          <td style={{ padding: 12 }}><button onClick={() => handleDelete(d.id)} style={{ color: G.red, background: "none", border: "none", cursor: "pointer" }}>🗑️</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {listLoading && <div style={{ textAlign: "center", padding: 16, color: G.muted }}>Loading…</div>}
              {discounts.length < discountTotal && !listLoading && (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <button onClick={() => loadList(false)} style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>Load more</button>
                </div>
              )}
            </div>
          )}

          {tab === "add" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <label style={lbl}>Supermarket</label>
                <select value={form.supermarket} onChange={e => setForm({...form, supermarket: e.target.value})} style={inp}>
                  {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                </select>
                <div style={{ marginTop: 15 }}>
                  <label style={lbl}>Product Name</label>
                  <input value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} style={inp} />
                </div>
                <div style={{ marginTop: 15 }}>
                  <label style={lbl}>Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} style={inp}>
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Discounted Price (€)</label>
                <input type="number" step="0.01" min="0" value={form.discounted_price} onChange={e => setForm({...form, discounted_price: e.target.value})} style={inp} />
                <div style={{ marginTop: 15 }}>
                  <label style={lbl}>Original Price (€)</label>
                  <input type="number" step="0.01" min="0" value={form.original_price} onChange={e => setForm({...form, original_price: e.target.value})} style={inp} />
                </div>
                <div style={{ marginTop: 15 }}>
                  <label style={lbl}>Valid Until</label>
                  <input type="date" value={form.valid_until} onChange={e => setForm({...form, valid_until: e.target.value})} style={inp} />
                </div>
                <div style={{ marginTop: 15, background: "#f8f9fa", padding: 12, borderRadius: 10, border: "1px solid #eee" }}>
                  <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                    <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} />
                    Προβεβλημένη προσφορά
                  </label>
                  {form.is_featured && (
                    <div style={{ marginTop: 12 }}>
                      <label style={lbl}>Featured Until</label>
                      <input type="date" value={form.featured_until} onChange={e => setForm({...form, featured_until: e.target.value})} style={inp} />
                      <div style={{ marginTop: 10 }}>
                        <label style={lbl}>Featured Label (προαιρετικό)</label>
                        <input value={form.featured_label} onChange={e => setForm({...form, featured_label: e.target.value})} placeholder="π.χ. Χορηγούμενο" style={inp} />
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={saveDiscount} disabled={saving} style={{ marginTop: 20, background: G.blue, color: "#fff", padding: "12px", width: "100%", borderRadius: 12, border: "none", fontWeight: 700 }}>{saving ? "Saving..." : "Save Offer"}</button>
              </div>
            </div>
          )}

        </div>
      </div>
      {msg.text && <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: msg.type === "error" ? G.red : "#1c1e24", color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 700, zIndex: 1000 }}>{msg.text}</div>}

      {productDetail && (
        <div
          onClick={() => setProductDetail(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, paddingRight: 16 }}>{productDetail.name}</h2>
              <button onClick={() => setProductDetail(null)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: G.muted, lineHeight: 1, padding: 0 }}>✕</button>
            </div>
            {productDetail.imageUrl && (
              <div style={{ background: "#f8f9fa", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
                <img src={productDetail.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }} />
              </div>
            )}
            <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
              <div><strong style={lbl}>Supermarket</strong>{productDetail.supermarket || "—"}</div>
              {productDetail.barcode && <div><strong style={lbl}>Barcode</strong>{productDetail.barcode}</div>}
              {productDetail.description && productDetail.description !== productDetail.name && (
                <div><strong style={lbl}>Description</strong>{productDetail.description}</div>
              )}
              <div><strong style={lbl}>Product ID</strong><code style={{ fontSize: 11, color: G.muted }}>{productDetail.id}</code></div>
              {productDetail.imageUrl && (
                <a href={productDetail.imageUrl} target="_blank" rel="noreferrer" style={{ color: G.blue, fontSize: 12, fontWeight: 700 }}>Open image ↗</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
