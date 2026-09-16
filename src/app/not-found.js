import Link from 'next/link';
import { Icon } from '@/components/Icons';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#f3f5f8', fontFamily: "var(--font-outfit), sans-serif" }}>
      <div style={{ maxWidth: 480, background: '#fff', borderRadius: 16, padding: 32, border: '1px solid #dee2e6', textAlign: 'center' }}>
        <div style={{ color: '#9aa1ab', marginBottom: 12 }}><Icon.Search size={40} /></div>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, marginBottom: 10 }}>Δε βρέθηκε</h1>
        <p style={{ color: '#707680', fontSize: 14, marginBottom: 24 }}>
          Η σελίδα ή προσφορά που αναζητάτε δεν είναι διαθέσιμη.
        </p>
        <Link
          href="/"
          style={{ background: '#009de0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', display: 'inline-block' }}
        >
          Επιστροφή στην αρχική
        </Link>
      </div>
    </div>
  );
}
