import prisma from '@/lib/prisma';
import Link from 'next/link';
import { unsubscribe } from '@/actions/subscribe';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  if (!token) return <div style={{ padding: 40, textAlign: 'center' }}>Λείπει το διακριτικό</div>;

  if (done === '1') {
    return (
      <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>👋</div>
        <h1 style={{ fontSize: 32, marginBottom: 16 }}>Έγινε η διαγραφή</h1>
        <p style={{ color: '#666', marginBottom: 32 }}>Δεν θα λάβεις ξανά email από εμάς.</p>
        <Link href="/" style={{ background: '#eee', color: '#1c1e24', padding: '12px 24px', borderRadius: 12, textDecoration: 'none', fontWeight: 700 }}>Επιστροφή στην αρχική</Link>
      </div>
    );
  }

  const sub = await prisma.subscriber.findUnique({ where: { unsubToken: token } });
  if (!sub) return <div style={{ padding: 40, textAlign: 'center' }}>Μη έγκυρο διακριτικό</div>;

  return (
    <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>🚪</div>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Διαγραφή από τη λίστα</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Σίγουρα θέλεις να διαγραφεί το <b>{sub.email}</b>;</p>
      <form action={unsubscribe}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" style={{ background: '#e63946', color: '#fff', padding: '14px 28px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          Ναι, διαγραφή
        </button>
      </form>
    </div>
  );
}
