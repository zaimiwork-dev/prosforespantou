'use client';

// «Ειδοποίησέ με» on the website's product page (owner 2026-11-23): an email
// when this product goes on offer at any store, gets cheaper, or reaches the
// person's price. Same three choices as the app (mobile/src/components/watch-sheet).
import { useState } from 'react';
import { watchProductByEmail } from '@/actions/watch-product';
import { Icon } from './Icons';

// «2,50» and «2.50» both mean 2,50 €.
const parsePrice = (s) => {
  const n = Number(String(s).trim().replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
};

export function WatchByEmail({ offerId }) {
  const [open, setOpen] = useState(false);
  const [onOffer, setOnOffer] = useState(true);
  const [onDrop, setOnDrop] = useState(true);
  const [useTarget, setUseTarget] = useState(false);
  const [target, setTarget] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  if (!open) {
    return (
      <button type="button" className="btn btn-outline watch-open" onClick={() => setOpen(true)}>
        <Icon.Bell size={16} /> Ειδοποίησέ με
      </button>
    );
  }

  if (done) {
    return (
      <div className="watch-box" role="status">
        <p className="watch-done">
          {done.needsConfirm
            ? 'Σου στείλαμε email επιβεβαίωσης. Μόλις το επιβεβαιώσεις, θα σε ειδοποιούμε για αυτό το προϊόν.'
            : `Θα σε ειδοποιούμε στο ${email.trim()}.`}
        </p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const targetPrice = useTarget ? parsePrice(target) : null;
    if (useTarget && targetPrice == null) return setError('Γράψε μια τιμή, π.χ. 2,50.');
    if (!onOffer && !onDrop && !useTarget) return setError('Διάλεξε τουλάχιστον ένα.');
    setBusy(true);
    setError(null);
    const res = await watchProductByEmail({ email, offerId, onOffer, onDrop, targetPrice, website }).catch(() => null);
    setBusy(false);
    if (!res?.success) return setError(res?.error || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    setDone({ needsConfirm: res.needsConfirm });
  };

  return (
    <form className="watch-box" onSubmit={submit}>
      <div className="watch-title"><Icon.Bell size={16} /> Ειδοποίησέ με</div>
      <p className="watch-lead">Παρακολουθούμε αυτό το προϊόν σε όλα τα καταστήματα που το έχουν.</p>
      <label className="watch-opt">
        <input type="checkbox" checked={onOffer} onChange={(e) => setOnOffer(e.target.checked)} />
        <span>Όταν μπει σε προσφορά <small>σε οποιοδήποτε κατάστημα</small></span>
      </label>
      <label className="watch-opt">
        <input type="checkbox" checked={onDrop} onChange={(e) => setOnDrop(e.target.checked)} />
        <span>Όταν πέσει η τιμή <small>κάτω από τη σημερινή χαμηλότερη</small></span>
      </label>
      <label className="watch-opt">
        <input type="checkbox" checked={useTarget} onChange={(e) => setUseTarget(e.target.checked)} />
        <span>Όταν φτάσει την τιμή μου</span>
      </label>
      {useTarget && (
        <div className="watch-target">
          <input
            type="text"
            inputMode="decimal"
            placeholder="π.χ. 2,50"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Η τιμή σου σε ευρώ"
          /> €
        </div>
      )}
      <input
        type="email"
        required
        className="watch-email"
        placeholder="Το email σου"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Το email σου"
        autoComplete="email"
      />
      <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hp-field" aria-hidden="true" />
      {error && <p className="watch-error" role="alert">{error}</p>}
      <div className="watch-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>Ενεργοποίηση</button>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Άκυρο</button>
      </div>
    </form>
  );
}
