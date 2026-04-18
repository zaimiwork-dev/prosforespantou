'use client';

const OPTIONS = [
  { id: "discount", label: "Καλύτερη έκπτωση", icon: "🔥" },
  { id: "expiring", label: "Τελειώνουν σύντομα", icon: "⏰" },
  { id: "newest", label: "Νεότερες", icon: "✨" },
];

export function SortBar({ value, onChange, totalCount }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", flex: 1, minWidth: 0 }}>
        {OPTIONS.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              style={{
                background: active ? "#1c1e24" : "#fff",
                color: active ? "#fff" : "#1c1e24",
                border: `1px solid ${active ? "#1c1e24" : "#ececf0"}`,
                borderRadius: 10,
                padding: "8px 14px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 13 }}>{o.icon}</span>
              {o.label}
            </button>
          );
        })}
      </div>
      {typeof totalCount === "number" && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#707680", whiteSpace: "nowrap" }}>
          {totalCount} προσφορές
        </div>
      )}
    </div>
  );
}
