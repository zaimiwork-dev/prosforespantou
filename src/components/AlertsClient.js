'use client';
import { useState } from 'react';
import { formatPrice, formatUnitPrice } from '@/lib/format-price';
import { createAlert, deleteAlert, deleteWatch } from '@/actions/alerts';
import { atChain } from '@/lib/list-basket';
import { SUPERMARKETS, ACTIVE_SUPERMARKETS, CATEGORIES } from '@/lib/constants';
import { Icon } from './Icons';

// One criterion chip on a saved alert: icon and text on the same baseline.
const CRIT = { display: 'inline-flex', alignItems: 'center', gap: 4 };

export function AlertsClient({ initialAlerts, initialWatches = [], token }) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  // «Ειδοποίησέ με» products (actions/watch-product), with today's best price.
  const [watches, setWatches] = useState(initialWatches || []);
  const [keyword, setKeyword] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedSMs, setSelectedSMs] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    const res = await createAlert({
      token,
      keyword: keyword.trim(),
      supermarkets: selectedSMs,
      category: category || undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
    });
    if (res.success) {
      setAlerts([res.alert, ...alerts]);
      setKeyword('');
      setMaxPrice('');
      setSelectedSMs([]);
      setCategory('');
      setMsg({ ok: true, text: 'Η ειδοποίηση προστέθηκε' });
    } else {
      setMsg({ ok: false, text: res.error });
    }
    setLoading(false);
    setTimeout(() => setMsg(null), 3000);
  };

  // Asks inside the row rather than through a browser dialog: one tap arms
  // the bin, the next one deletes, and it disarms itself after five seconds.
  const handleDelete = async (id) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      setTimeout(() => setPendingDelete((cur) => (cur === id ? null : cur)), 5000);
      return;
    }
    setPendingDelete(null);
    const res = await deleteAlert(token, id);
    if (res.success) {
      setAlerts(alerts.filter(a => a.id !== id));
    }
  };

  const handleDeleteWatch = async (id) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      setTimeout(() => setPendingDelete((cur) => (cur === id ? null : cur)), 5000);
      return;
    }
    setPendingDelete(null);
    const res = await deleteWatch(token, id);
    if (res.success) setWatches(watches.filter((w) => w.id !== id));
  };
  const chainName = (id) => SUPERMARKETS.find((sm) => sm.id === id)?.name || id;

  const toggleSM = (id) => {
    setSelectedSMs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const inp = { width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #ddd', outline: 'none', fontSize: 14 };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Οι ειδοποιήσεις μου</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Θα σε ενημερώσουμε αμέσως μόλις βρεθεί προσφορά που ταιριάζει στα κριτήριά σου.</p>

      {watches.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 12px' }}>Προϊόντα που παρακολουθείς</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {watches.map((w) => (
              <div key={w.id} style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{w.name}</div>
                  {w.now ? (
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F5132' }}>
                      Τώρα {formatPrice(w.now.price)} {atChain(w.now.chain, chainName(w.now.chain))}{w.now.kind === 'offer' ? ' · σε προσφορά' : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: '#666' }}>Δεν έχουμε σημερινή τιμή</div>
                  )}
                  <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                    Σε ειδοποιούμε {[w.onOffer && 'όταν μπει σε προσφορά', w.onDrop && 'όταν πέσει η τιμή', w.targetPrice != null && `όταν φτάσει τα ${formatPrice(w.targetPrice)}`].filter(Boolean).join(', ')}.
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteWatch(w.id)}
                  aria-label={`Σταμάτα την ειδοποίηση: ${w.name}`}
                  style={{
                    background: pendingDelete === w.id ? '#e63946' : 'none',
                    color: pendingDelete === w.id ? '#fff' : '#e63946',
                    border: 'none', borderRadius: 10, cursor: 'pointer',
                    padding: pendingDelete === w.id ? '8px 12px' : 8,
                    fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
                  }}
                >
                  <Icon.Trash size={16} />
                  {pendingDelete === w.id && 'Διαγραφή;'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #eee', marginBottom: 40, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Προσθήκη νέας ειδοποίησης</h3>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>Λέξη κλειδί (π.χ. γάλα)</label>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="π.χ. ελαιόλαδο" style={inp} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>Μέγιστη τιμή (€)</label>
              <input type="number" step="0.01" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Προαιρετικό" style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>Κατηγορία</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              <option value="">Όλες οι κατηγορίες</option>
              {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 8, textTransform: 'uppercase' }}>Σούπερ Μάρκετ (επιλογή)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ACTIVE_SUPERMARKETS.map(sm => (
                <button
                  key={sm.id}
                  type="button"
                  onClick={() => toggleSM(sm.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: '1px solid',
                    background: selectedSMs.includes(sm.id) ? sm.color : '#fff',
                    borderColor: selectedSMs.includes(sm.id) ? sm.color : '#ddd',
                    color: selectedSMs.includes(sm.id) ? '#fff' : '#666'
                  }}
                >
                  {sm.short}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading} style={{ background: '#1c1e24', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 700, width: '100%', cursor: 'pointer' }}>
            {loading ? '...' : 'ΔΗΜΙΟΥΡΓΙΑ ΕΙΔΟΠΟΙΗΣΗΣ'}
          </button>
        </form>
        {msg && (
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: 700, color: msg.ok ? '#2d6a4f' : '#e63946' }}>
            {msg.text}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, background: '#f8f9fa', borderRadius: 20, border: '1px dashed #ddd', color: '#999' }}>
            Δεν έχεις καμία ενεργή ειδοποίηση.
          </div>
        )}
        {alerts.map(a => (
          <div key={a.id} style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{a.keyword}</div>
              <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {a.maxPrice && <span style={CRIT}><Icon.Wallet size={13} /> Έως {formatPrice(a.maxPrice)}</span>}
                {a.category && <span style={CRIT}><Icon.Box size={13} /> {a.category}</span>}
                {a.supermarkets.length > 0 && <span style={CRIT}><Icon.Store size={13} /> {a.supermarkets.map(s => SUPERMARKETS.find(sm => sm.id === s)?.short).join(', ')}</span>}
                {!a.maxPrice && !a.category && a.supermarkets.length === 0 && <span>Όλα τα κριτήρια</span>}
              </div>
            </div>
            <button
              onClick={() => handleDelete(a.id)}
              style={{
                background: pendingDelete === a.id ? '#e63946' : 'none',
                color: pendingDelete === a.id ? '#fff' : '#e63946',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                padding: pendingDelete === a.id ? '8px 12px' : 8,
                fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon.Trash size={16} />
              {pendingDelete === a.id && 'Διαγραφή;'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
