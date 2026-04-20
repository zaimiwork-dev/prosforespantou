'use client';

import { useState, useEffect, useCallback } from "react";
import { verifyAdminPassword, logoutAdmin } from "@/actions/verify-admin";
import { getProducts } from "@/actions/get-products";
import { listDiscounts } from "@/actions/admin/list-discounts";
import { deleteDiscount } from "@/actions/admin/delete-discount";
import { createDiscount } from "@/actions/admin/create-discount";
import { createLeaflet, listLeaflets, deleteLeaflet } from "@/actions/admin/leaflet-actions";
import { getStats } from "@/actions/admin/get-stats";
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
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [search, setSearch] = useState("");
  const [leaflets, setLeaflets] = useState([]);
  const [leafletForm, setLeafletForm] = useState(emptyLeafletForm);
  const [leafletSaving, setLeafletSaving] = useState(false);
  const [stats, setStats] = useState({ last30: [], last7: [] });
  const [statsLoading, setStatsLoading] = useState(false);

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3500);
  };

  const loadList = useCallback(async (reset = false) => {
    setListLoading(true);
    try {
      const nextOffset = reset ? 0 : discountOffset;
      const res = await listDiscounts({ limit: PAGE_SIZE, offset: nextOffset, search });
      setDiscountTotal(res.total || 0);
      const fetched = res.discounts || [];
      setDiscounts(reset ? fetched : (prev) => [...prev, ...fetched]);
      setDiscountOffset(nextOffset + fetched.length);
    } catch (e) {
      showMsg("Failed to load: " + (e?.message || "unknown"), "error");
    }
    setListLoading(false);
  }, [discountOffset, search]);

  const loadLibrary = async () => {
    setLibLoading(true);
    try {
      const result = await getProducts({ search: libSearch, supermarket: libSM, limit: 100 });
      setProducts(result.products || []);
      setProductTotal(result.total || 0);
    } catch (e) {
      showMsg("Failed to load products", "error");
    }
    setLibLoading(false);
  };

  useEffect(() => {
    loadList(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "lib") loadLibrary();
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

  useEffect(() => {
    if (tab === "leaf") loadLeaflets();
    if (tab === "stats") loadStats();
  }, [tab]);

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
            {[["list", `📋 Λίστα`], ["lib", "📚 Library"], ["leaf", "📖 Φυλλάδια"], ["stats", "📊 Αναλυτικά"], ["add", "➕ Νέα"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ background: tab === id ? "#1c1e24" : "transparent", color: tab === id ? "#fff" : "#707680", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "stats" && renderStatsTable()}

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
                <button onClick={loadLibrary} style={{ background: G.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>🔄 LOAD PRODUCTS</button>
                <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: G.muted }}>{productTotal} items</div>
              </div>
              {libLoading ? (
                <div style={{ textAlign: "center", padding: 60, background: "#f8f9fa", borderRadius: 16 }}>⏳ Fetching products...</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                  {products.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#888" }}>No products found in database.</div>}
                  {products.map(p => (
                    <div key={p.id} style={{ background: "#fff", borderRadius: 12, padding: 10, border: "1px solid #eee", textAlign: "center" }}>
                      <div style={{ aspectRatio: "1/1", background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                        {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} />}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, height: "2.4em", overflow: "hidden", lineHeight: 1.2 }}>{p.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "list" && (
            <div>
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search active offers..." style={{ ...inp, maxWidth: 320 }} />
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
                      <th style={{ padding: 12 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map(d => (
                      <tr key={d.id} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: 12 }}>{d.productName}</td>
                        <td style={{ padding: 12 }}>{d.category}</td>
                        <td style={{ padding: 12 }}>{d.discountedPrice}€</td>
                        <td style={{ padding: 12 }}>{d.supermarket}</td>
                        <td style={{ padding: 12 }}><button onClick={() => handleDelete(d.id)} style={{ color: G.red, background: "none", border: "none", cursor: "pointer" }}>🗑️</button></td>
                      </tr>
                    ))}
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
                <button onClick={saveDiscount} disabled={saving} style={{ marginTop: 20, background: G.blue, color: "#fff", padding: "12px", width: "100%", borderRadius: 12, border: "none", fontWeight: 700 }}>{saving ? "Saving..." : "Save Offer"}</button>
              </div>
            </div>
          )}

        </div>
      </div>
      {msg.text && <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: msg.type === "error" ? G.red : "#1c1e24", color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 700, zIndex: 1000 }}>{msg.text}</div>}
    </div>
  );
}
