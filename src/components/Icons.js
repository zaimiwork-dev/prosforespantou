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
};
