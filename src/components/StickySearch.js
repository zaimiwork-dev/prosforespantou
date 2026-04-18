'use client';

export function StickySearch({ search, onSearch, onCancel, showCancel }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(10px)",
        padding: "12px 16px",
        borderBottom: "1px solid #ececf0",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Αναζήτηση προϊόντος..."
            style={{
              width: "100%",
              padding: "11px 16px 11px 42px",
              borderRadius: 12,
              border: "1px solid #ececf0",
              background: "#f6f7f9",
              fontSize: 15,
              outline: "none",
              fontWeight: 500,
            }}
          />
          <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, color: "#8b929c" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {showCancel && (
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", color: "#009de0", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "0 4px" }}
          >
            ΑΚΥΡΟ
          </button>
        )}
      </div>
    </div>
  );
}
