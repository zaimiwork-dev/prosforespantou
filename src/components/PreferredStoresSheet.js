'use client';

import { useState } from 'react';
import { useShoppingListStore } from '@/lib/store';
import { SUPERMARKETS, CATEGORIES } from '@/lib/constants';
import { CategoryIcon } from './CategoryIcon';

// User preferences: which stores they shop at AND which departments they
// usually buy ("Τι αγοράζεις συνήθως;"). Opened from the header gear, and —
// with `intro` — auto-opened once on a first visit as onboarding: with 11k+
// offers, a new user who picks 2 stores and 4 categories immediately gets a
// feed about THEM (the Για σένα rail + filtered carousels) instead of an
// overwhelming wall.
export function PreferredStoresSheet({ isOpen, onClose, intro = false }) {
  // Mount the sheet fresh on every open so the draft state starts from the
  // saved selection — no setState-inside-effect syncing.
  if (!isOpen) return null;
  return <PreferredStoresSheetInner onClose={onClose} intro={intro} />;
}

// Departments worth declaring — 'Άλλο' carries no signal.
const PICKABLE = CATEGORIES.filter((c) => c.id !== 'all' && c.id !== 'Άλλο');

function PreferredStoresSheetInner({ onClose, intro }) {
  const { preferredStores, togglePreferred, preferredCategories, togglePreferredCategory } = useShoppingListStore();
  const [local, setLocal] = useState(preferredStores);
  const [localCats, setLocalCats] = useState(preferredCategories);

  const toggle = (id) =>
    setLocal((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleCat = (id) =>
    setLocalCats((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = () => {
    // Sync local -> store by diffing
    for (const sm of SUPERMARKETS) {
      if (local.includes(sm.id) !== preferredStores.includes(sm.id)) togglePreferred(sm.id);
    }
    for (const c of PICKABLE) {
      if (localCats.includes(c.id) !== preferredCategories.includes(c.id)) togglePreferredCategory(c.id);
    }
    onClose();
  };

  const clear = () => {
    setLocal([]);
    setLocalCats([]);
  };

  const picked = local.length + localCats.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "100%",
          maxWidth: 420,
          height: "100%",
          background: "#fff",
          boxShadow: "-5px 0 25px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-outfit), sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #ececf0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#1c1e24", display: "flex", alignItems: "center", gap: 8 }}>
            {intro ? 'Καλώς ήρθες! 👋' : '⚙️ Οι προτιμήσεις μου'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Κλείσιμο"
            style={{
              background: "#f3f5f8",
              border: "none",
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 700,
              color: "#8b929c"
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <p style={{ fontSize: 14, color: "#8b929c", margin: "0 0 20px 0", lineHeight: "1.5" }}>
            {intro
              ? 'Χιλιάδες προσφορές κάθε μέρα — πες μας τι ψωνίζεις και θα σου δείχνουμε πρώτα ό,τι σε ενδιαφέρει. Τα αλλάζεις όποτε θες από το ⚙️ πάνω δεξιά.'
              : 'Διάλεξε καταστήματα και κατηγορίες. Θα προτεραιοποιούμε προσφορές από αυτά.'}
          </p>

          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#8b929c', marginBottom: 10 }}>
            Τα καταστήματά μου
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {SUPERMARKETS.map((sm) => {
              const isSelected = local.includes(sm.id);
              return (
                <button
                  key={sm.id}
                  onClick={() => toggle(sm.id)}
                  aria-pressed={isSelected}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 12px",
                    borderRadius: 16,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                    position: "relative",
                    background: isSelected ? `${sm.color}15` : "#fff",
                    border: isSelected ? `2px solid ${sm.color}` : "1px solid #ececf0",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e24" }}>{sm.name}</span>
                  {isSelected && (
                    <span style={{ position: "absolute", top: 6, right: 8, fontSize: 12, color: sm.color, fontWeight: 900 }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#8b929c', margin: '26px 0 10px' }}>
            Τι αγοράζεις συνήθως;
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PICKABLE.map((c) => {
              const isSelected = localCats.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCat(c.id)}
                  aria-pressed={isSelected}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1c1e24",
                    background: isSelected ? "#e7f6ee" : "#fff",
                    border: isSelected ? "2px solid #2d6a4f" : "1px solid #ececf0",
                  }}
                >
                  <CategoryIcon id={c.id} size={15} />
                  {c.label}
                  {isSelected && <span style={{ color: "#2d6a4f", fontWeight: 900 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 24px", borderTop: "1px solid #ececf0", display: "flex", gap: 12, background: "#fff" }}>
          <button
            onClick={intro && picked === 0 ? onClose : clear}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: 14,
              border: "1px solid #ececf0",
              background: "#f3f5f8",
              color: "#8b929c",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {intro && picked === 0 ? 'Παράλειψη' : 'Καθαρισμός'}
          </button>
          <button
            onClick={save}
            style={{
              flex: 2,
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #009de0, #0077b6)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,157,224,0.2)"
            }}
          >
            {picked === 0
              ? 'Δες όλες τις προσφορές'
              : intro ? `Ξεκίνα (${picked})` : `Αποθήκευση (${picked})`}
          </button>
        </div>
      </div>
    </div>
  );
}
