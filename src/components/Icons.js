// Stroke SVG icons used across the UI. No emoji.
// Pass `size` to control width/height; stroke uses currentColor.

const base = (size) => ({
  width: size, height: size,
  viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round", strokeLinejoin: "round",
});

export const Icon = {
  Search: ({ size = 18 }) => (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Bag: ({ size = 20 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  Settings: ({ size = 18 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
  X: ({ size = 18 }) => (
    <svg {...base(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  Plus: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
  ),
  Minus: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="2.4"><path d="M5 12h14" /></svg>
  ),
  Check: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="2.4"><path d="m5 12 4.5 4.5L19 7" /></svg>
  ),
  Star: ({ size = 16, filled = false }) => (
    <svg {...base(size)} fill={filled ? "currentColor" : "none"} strokeWidth="1.8">
      <path d="M12 3.2 14.7 9l6.1.6-4.6 4.1 1.3 6-5.5-3.2L6.5 19.7l1.3-6L3.2 9.6 9.3 9 12 3.2Z" />
    </svg>
  ),
  ChevronRight: ({ size = 14 }) => (
    <svg {...base(size)}><path d="m9 6 6 6-6 6" /></svg>
  ),
  ChevronLeft: ({ size = 14 }) => (
    <svg {...base(size)}><path d="m15 6-6 6 6 6" /></svg>
  ),
  ArrowRight: ({ size = 16 }) => (
    <svg {...base(size)}><path d="M5 12h14m0 0-6-6m6 6-6 6" /></svg>
  ),
  Clock: ({ size = 12 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Sort: ({ size = 14 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  ),
  Trash: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Fire: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M12 3c.5 3 3 5 3 8a3 3 0 1 1-6 0c0-1 .5-1.8 1-2.5-1.5.5-3 2-3 4.5a5 5 0 0 0 10 0c0-5-5-7-5-10Z" />
    </svg>
  ),
  Share: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  ),
  Home: ({ size = 20 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="m3 10.5 9-7.5 9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  Tag: ({ size = 20 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M3 3h8l10 10-8 8L3 11V3Z" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  Grid: ({ size = 20 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  // Comparison, alerts and empty states — added 2026-09-16 when the emoji
  // that stood in for them (🔔 💰 📦 🏢 💡 📖 ⚠️ 🔍 ⚖️) were replaced: they
  // rendered differently on every platform and read as decoration, not UI.
  Bell: ({ size = 18 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M18 9a6 6 0 1 0-12 0c0 4-1.5 5.5-2 6h16c-.5-.5-2-2-2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  Wallet: ({ size = 14 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
    </svg>
  ),
  Box: ({ size = 14 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
      <path d="m3 8.5 9 4.5 9-4.5M12 13v7" />
    </svg>
  ),
  Store: ({ size = 14 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3 5h18l1 4a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0l1-4Z" />
    </svg>
  ),
  Book: ({ size = 16 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
    </svg>
  ),
  Info: ({ size = 14 }) => (
    <svg {...base(size)} strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Warning: ({ size = 32 }) => (
    <svg {...base(size)} strokeWidth="1.6">
      <path d="M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
};
