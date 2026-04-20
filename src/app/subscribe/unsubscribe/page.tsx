import prisma from '@/lib/prisma';
import Link from 'next/link';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <div style={{ padding: 40, textAlign: 'center' }}>Missing token</div>;

  const sub = await prisma.subscriber.update({
    where: { unsubToken: token },
    data: { unsubscribedAt: new Date() },
  }).catch(() => null);

  if (!sub) return <div style={{ padding: 40, textAlign: 'center' }}>Invalid token</div>;

  return (
    <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>👋</div>
      <h1 style={{ fontSize: 32, marginBottom: 16 }}>Έγινε η διαγραφή</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Δεν θα λάβεις ξανά email από εμάς.</p>
      <Link href="/" style={{ background: '#eee', color: '#1c1e24', padding: '12px 24px', borderRadius: 12, textDecoration: 'none', fontWeight: 700 }}>Επιστροφή στην αρχική</Link>
    </div>
  );
}
