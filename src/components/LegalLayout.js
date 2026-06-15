// Shared chrome for the static legal pages (Απόρρητο / Όροι / Cookies).
// Server component — plain readable layout matching the site's vanilla-CSS style.
import Link from 'next/link';

export function LegalLayout({ title, updated, children }) {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 96px', lineHeight: 1.65, color: '#1d1d1f' }}>
      <Link href="/" style={{ fontSize: 13, color: '#009de0', textDecoration: 'none' }}>← Αρχική</Link>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: '16px 0 4px' }}>{title}</h1>
      {updated && (
        <p style={{ fontSize: 12.5, color: '#888', margin: '0 0 24px' }}>
          Τελευταία ενημέρωση: {updated}
        </p>
      )}
      <div style={{ fontSize: 15 }}>{children}</div>

      <nav style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid #eee', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
        <Link href="/aporrito" style={{ color: '#555' }}>Πολιτική Απορρήτου</Link>
        <Link href="/cookies" style={{ color: '#555' }}>Πολιτική Cookies</Link>
        <Link href="/oroi-chrisis" style={{ color: '#555' }}>Όροι Χρήσης</Link>
      </nav>
    </main>
  );
}

// Small shared bits so the three pages stay visually consistent.
export function H2({ children }) {
  return <h2 style={{ fontSize: 19, fontWeight: 800, margin: '28px 0 8px' }}>{children}</h2>;
}
export function Fill({ children }) {
  // Visible marker for content the owner / a lawyer must finalise before launch.
  return (
    <span style={{ background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: 4, padding: '0 4px', fontSize: 13 }}>
      ⚠️ {children}
    </span>
  );
}
