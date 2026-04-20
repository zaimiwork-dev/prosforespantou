import prisma from '@/lib/prisma';
import Link from 'next/link';
import { confirmSubscription } from '@/actions/subscribe';

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  if (!token) return <div style={{ padding: 40, textAlign: 'center' }}>Λείπει το διακριτικό</div>;

  if (done === '1') {
    return (
      <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
        <h1 style={{ fontSize: 32, marginBottom: 16 }}>Ευχαριστούμε!</h1>
        <p style={{ color: '#666', marginBottom: 32 }}>Το email σου επιβεβαιώθηκε. Θα λαμβάνεις τις κορυφαίες προσφορές κάθε εβδομάδα.</p>
        <Link href="/" style={{ background: '#009de0', color: '#fff', padding: '12px 24px', borderRadius: 12, textDecoration: 'none', fontWeight: 700 }}>Επιστροφή στην αρχική</Link>
      </div>
    );
  }

  const sub = await prisma.subscriber.findUnique({ where: { confirmToken: token } });
  if (!sub) return <div style={{ padding: 40, textAlign: 'center' }}>Μη έγκυρο ή ληγμένο διακριτικό</div>;

  return (
    <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>📧</div>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Επιβεβαίωση εγγραφής</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Πάτησε το κουμπί για να επιβεβαιώσεις το <b>{sub.email}</b>.</p>
      <form action={confirmSubscription}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" style={{ background: '#009de0', color: '#fff', padding: '14px 28px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          Επιβεβαίωση
        </button>
      </form>
    </div>
  );
}
