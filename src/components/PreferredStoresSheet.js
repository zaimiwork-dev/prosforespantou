'use client';

import { useState, useEffect } from 'react';
import { useShoppingListStore } from '@/lib/store';
import { SUPERMARKETS } from '@/lib/constants';

export function PreferredStoresSheet({ isOpen, onClose }) {
  const { preferredStores, togglePreferred, clearPreferred } = useShoppingListStore();
  const [local, setLocal] = useState(preferredStores);

  useEffect(() => {
    if (isOpen) {
      setLocal(preferredStores);
    }
  }, [preferredStores, isOpen]);

  if (!isOpen) return null;

  const toggle = (id) =>
    setLocal((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = () => {
    // Sync local -> store by diffing
    for (const sm of SUPERMARKETS) {
      const inLocal = local.includes(sm.id);
      const inStore = preferredStores.includes(sm.id);
      if (inLocal !== inStore) {
        togglePreferred(sm.id);
      }
    }
    onClose();
  };

  const clear = () => {
    setLocal([]);
  };

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
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #ececf0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#1c1e24", display: "flex", alignItems: "center", gap: 8 }}>
            ⚙️ Τα καταστήματά μου
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
          <p style={{ fontSize: 14, color: "#8b929c", margin: "0 0 24px 0", lineHeight: "1.5" }}>
            Διάλεξε τα σούπερ μάρκετ που ψωνίζεις. Θα βλέπεις προσφορές μόνο από αυτά.
          </p>

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
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 24px", borderTop: "1px solid #ececf0", display: "flex", gap: 12, background: "#fff" }}>
          <button
            onClick={clear}
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
            Καθαρισμός
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
            {local.length === 0 ? 'Δες όλες τις προσφορές' : `Αποθήκευση (${local.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
