import { getAlerts } from '@/actions/alerts';
import { AlertsClient } from '@/components/AlertsClient';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  
  if (!token) {
    // Reached without an email link (e.g. typed the URL). Don't dead-end —
    // explain what alerts are and route the visitor somewhere useful.
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <SiteHeader cartCount={0} />
        <main style={{ flex: 1, padding: '48px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Ειδοποιήσεις προσφορών</h1>
          <p style={{ color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 8 }}>
            Γράψου στο newsletter από την αρχική σελίδα και θα σου στέλνουμε email
            όταν προϊόντα που σε ενδιαφέρουν μπαίνουν σε προσφορά.
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Αν έχεις ήδη γραφτεί, άνοιξε τη σελίδα αυτή από τον σύνδεσμο στο email
            επιβεβαίωσης — εκεί γίνεται η διαχείριση των ειδοποιήσεών σου.
          </p>
          <a href="/deals" className="btn btn-primary">Δες τις προσφορές</a>
        </main>
        <Footer />
      </div>
    );
  }

  const res = await getAlerts(token);
  
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SiteHeader cartCount={0} />
      <main style={{ flex: 1, padding: '40px 20px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        {!res.success ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, marginBottom: 16 }}>{res.unconfirmed ? 'Εκκρεμεί Επιβεβαίωση' : 'Σφάλμα'}</h1>
            <p style={{ color: '#666' }}>{res.error === 'Email not confirmed' ? 'Παρακαλούμε επιβεβαιώστε πρώτα το email σας για να διαχειριστείτε τις ειδοποιήσεις.' : res.error}</p>
          </div>
        ) : (
          <AlertsClient initialAlerts={res.alerts} token={token} />
        )}
      </main>
      <Footer />
    </div>
  );
}
