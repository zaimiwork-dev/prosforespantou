import { getAlerts } from '@/actions/alerts';
import { AlertsClient } from '@/components/AlertsClient';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <SiteHeader cartCount={0} />
        <main style={{ flex: 1, padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Διαχείριση Ειδοποιήσεων</h1>
          <p style={{ color: '#666' }}>Λείπει το διακριτικό ασφαλείας. Παρακαλούμε χρησιμοποιήστε τον σύνδεσμο από το email επιβεβαίωσης.</p>
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
