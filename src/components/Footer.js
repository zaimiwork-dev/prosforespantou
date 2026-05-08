'use client';
import { useState } from 'react';
import { subscribe } from '@/actions/subscribe';

export function Footer() {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    const res = await subscribe({ email, source: 'homepage_footer', website });
    if (res.success) {
      setStatus('success');
      setEmail('');
    } else if (res.rateLimited) {
      setStatus('rate_limited');
    } else {
      setStatus('error');
    }
  };

  return (
    <footer style={{ background: '#fff', borderTop: '1px solid #eee', padding: '48px 20px', marginTop: 40 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900 }}>Μην χάνεις καμία προσφορά! 📢</h3>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14, maxWidth: 400 }}>
          Θα σου στέλνουμε τις κορυφαίες προσφορές της εβδομάδας. Άκυρο οποτεδήποτε.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 400 }}>
          {/* Honeypot: hidden from humans, harvested by bots. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-hidden="true"
            style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Το email σου..."
            required
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #ddd',
              outline: 'none', fontSize: 14
            }}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            style={{
              background: '#009de0', color: '#fff', border: 'none', padding: '12px 24px',
              borderRadius: 12, fontWeight: 700, cursor: 'pointer'
            }}
          >
            {status === 'sending' ? '...' : 'Εγγραφή'}
          </button>
        </form>

        {status === 'success' && <p style={{ color: '#2d6a4f', fontSize: 12, marginTop: 12, fontWeight: 700 }}>✓ Είσαι στη λίστα! Θα σε ειδοποιήσουμε όταν ξεκινήσει το newsletter.</p>}
        {status === 'rate_limited' && <p style={{ color: '#e63946', fontSize: 12, marginTop: 12, fontWeight: 700 }}>⏳ Πολλές προσπάθειες. Δοκίμασε σε λίγο.</p>}
        {status === 'error' && <p style={{ color: '#e63946', fontSize: 12, marginTop: 12, fontWeight: 700 }}>❌ Κάτι πήγε στραβά. Δοκίμασε ξανά.</p>}

        <div style={{ marginTop: 48, fontSize: 12, color: '#999' }}>
          © {new Date().getFullYear()} Προσφορές Παντού. Με επιφύλαξη παντός δικαιώματος.
        </div>
      </div>
    </footer>
  );
}
