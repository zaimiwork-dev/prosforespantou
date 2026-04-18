'use client';

import { SUPERMARKETS } from '@/lib/constants';

export function SupermarketBar({ active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        scrollbarWidth: "none",
        marginBottom: 14,
        paddingBottom: 2,
      }}
    >
      <button
        onClick={() => onChange("all")}
        style={{
          background: active === "all" ? "#009de0" : "#fff",
          color: active === "all" ? "#fff" : "#1c1e24",
          padding: "8px 16px",
          borderRadius: 10,
          border: `1px solid ${active === "all" ? "#009de0" : "#ececf0"}`,
          fontWeight: 800,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
          letterSpacing: "0.3px",
        }}
      >
        ΟΛΑ
      </button>
      {SUPERMARKETS.map((sm) => {
        const isActive = active === sm.id;
        return (
          <button
            key={sm.id}
            onClick={() => onChange(sm.id)}
            style={{
              background: isActive ? sm.color : "#fff",
              color: isActive ? "#fff" : "#1c1e24",
              padding: "8px 16px",
              borderRadius: 10,
              border: `1px solid ${isActive ? sm.color : "#ececf0"}`,
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: "0.2px",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isActive ? "#fff" : sm.color,
                opacity: isActive ? 0.9 : 1,
              }}
            />
            {sm.name}
          </button>
        );
      })}
    </div>
  );
}
