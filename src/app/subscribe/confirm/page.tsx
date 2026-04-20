import prisma from '@/lib/prisma';
import Link from 'next/link';

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <div style={{ padding: 40, textAlign: 'center' }}>Missing token</div>;

  const sub = await prisma.subscriber.update({
    where: { confirmToken: token },
    data: { confirmedAt: new Date(), unsubscribedAt: null },
  }).catch(() => null);

  if (!sub) return <div style={{ padding: 40, textAlign: 'center' }}>Invalid or expired token</div>;

  return (
    <div style={{ padding: 100, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
      <h1 style={{ fontSize: 32, marginBottom: 16 }}>Ευχαριστούμε!</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Το email σου επιβεβαιώθηκε. Θα λαμβάνεις τις κορυφαίες προσφορές κάθε εβδομάδα.</p>
      <Link href="/" style={{ background: '#009de0', color: '#fff', padding: '12px 24px', borderRadius: 12, textDecoration: 'none', fontWeight: 700 }}>Επιστροφή στην αρχική</Link>
    </div>
  );
}
