'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#f3f5f8', fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ maxWidth: 480, background: '#fff', borderRadius: 16, padding: 32, border: '1px solid #dee2e6', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, marginBottom: 10 }}>Κάτι πήγε στραβά</h1>
        <p style={{ color: '#707680', fontSize: 14, marginBottom: 24 }}>
          Δοκιμάστε ξανά σε λίγα δευτερόλεπτα.
        </p>
        <button
          onClick={reset}
          style={{ background: '#009de0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          Δοκιμή ξανά
        </button>
      </div>
    </div>
  );
}
