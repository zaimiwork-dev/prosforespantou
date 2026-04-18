'use client';

import { useState, useEffect, useCallback } from "react";
import { verifyAdminPassword, logoutAdmin } from "@/actions/verify-admin";
import { getProducts } from "@/actions/get-products";
import { listDiscounts } from "@/actions/admin/list-discounts";
import { deleteDiscount } from "@/actions/admin/delete-discount";
import { createDiscount } from "@/actions/admin/create-discount";
import { SUPERMARKETS, CATEGORIES } from "@/lib/constants";

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
  const [aiImage, setAiImage] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [woltJson, setWoltJson] = useState("");
  const [importingWolt, setImportingWolt] = useState(false);
  const [products, setProducts] = useState([]);
  const [productTotal, setProductTotal] = useState(0);
  const [libSearch, setLibSearch] = useState("");
  const [libSM, setLibSM] = useState("all");
  const [libLoading, setLibLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [search, setSearch] = useState("");

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3500);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showMsg("Image must be 5MB or smaller", "error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setAiImage(reader.result);
    reader.readAsDataURL(file);
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

  useEffect(() => {
    const t = setTimeout(() => loadList(true), 250);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWoltImport = async () => {
    if (!woltJson.trim()) { showMsg("Please paste JSON first", "error"); return; }
    setImportingWolt(true);
    try {
      const parsed = JSON.parse(woltJson);
      const res = await fetch("/api/admin/import-wolt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: parsed, supermarketId: form.supermarket }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      showMsg(`✓ Imported ${data.count} products!`);
      setWoltJson("");
      loadLibrary();
      loadList(true);
    } catch (e) { showMsg("Import failed: " + e.message, "error"); }
    setImportingWolt(false);
  };

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

  const runAI = async () => {
    if (!aiImage) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/extract-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: aiImage, supermarketId: form.supermarket }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      showMsg(`✓ ${json.count} προσφορές εξαχθήκαν!`);
      loadList(true);
    } catch (e) { showMsg("Σφάλμα AI: " + e.message, "error"); }
    setAiLoading(false);
  };

  const handleLogout = async () => {
    await logoutAdmin();
    onBack();
  };

  const inp = { background: "#fff", border: `1px solid #ddd`, borderRadius: 10, padding: "10px 14px", color: "#1c1e24", fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" };
  const lbl = { color: "#707680", fontSize: 11, fontWeight: 700, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };
  const filteredList = discounts.filter((d) => !search || normalize(d.productName || "").includes(normalize(search)));

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
            {[["list", `📋 Λίστα`], ["lib", "📚 Library"], ["leaf", "📖 Φυλλάδια"], ["add", "➕ Νέα"], ["ai", "🤖 AI"], ["wolt", "📦 Wolt"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ background: tab === id ? "#1c1e24" : "transparent", color: tab === id ? "#fff" : "#707680", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "leaf" && (
            <div>
               <div style={{ textAlign: 'center', padding: 40, color: G.muted }}>
                 <p>Διαχείριση Φυλλαδίων (Σύντομα Διαθέσιμο)</p>
                 <p style={{ fontSize: 10 }}>Το μοντέλο δεδομένων έχει υλοποιηθεί.</p>
               </div>
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

          {tab === "ai" && (
            <div>
              <select value={form.supermarket} onChange={e => setForm({...form, supermarket: e.target.value})} style={{ ...inp, maxWidth: 260, marginBottom: 15 }}>
                {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
              </select>
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ marginBottom: 20, display: "block" }} />
              {aiImage && <img src={aiImage} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 12, marginBottom: 20, display: "block" }} />}
              <button onClick={runAI} disabled={aiLoading || !aiImage} style={{ background: G.blue, color: "#fff", padding: "12px 24px", borderRadius: 12, border: "none", fontWeight: 700 }}>{aiLoading ? "Analyzing..." : "Scan with AI"}</button>
            </div>
          )}

          {tab === "wolt" && (
            <div>
              <select value={form.supermarket} onChange={e => setForm({...form, supermarket: e.target.value})} style={{ ...inp, maxWidth: 260, marginBottom: 15 }}>
                {SUPERMARKETS.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
              </select>
              <textarea value={woltJson} onChange={e => setWoltJson(e.target.value)} placeholder="Paste Wolt JSON here..." rows={10} style={{ ...inp, fontFamily: "monospace", fontSize: 11 }} />
              <button onClick={handleWoltImport} disabled={importingWolt} style={{ marginTop: 15, background: G.blue, color: "#fff", padding: "12px 24px", borderRadius: 12, border: "none", fontWeight: 700 }}>{importingWolt ? "Syncing..." : "Import Products"}</button>
            </div>
          )}
        </div>
      </div>
      {msg.text && <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: msg.type === "error" ? G.red : "#1c1e24", color: "#fff", padding: "12px 24px", borderRadius: 12, fontWeight: 700, zIndex: 1000 }}>{msg.text}</div>}
    </div>
  );
}
