'use client';

import { useShoppingListStore } from "@/lib/store";
import Link from "next/link";
import { useState } from "react";

/**
 * Client-side component to handle interactions on the Offer Page.
 */
export default function OfferClientContent({ offer }) {
  const { addItem } = useShoppingListStore();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(offer);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const getDaysLeft = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expDate = new Date(dateStr); expDate.setHours(0, 0, 0, 0);
    return Math.round((expDate - today) / 86400000);
  };

  const daysLeft = getDaysLeft(offer.validUntil);

  return (
    <div className="bg-[#0f1115] text-slate-200 min-h-screen font-sans pb-20">
      <header className="p-4 border-b border-white/5 sticky top-0 bg-[#0f1115]/80 backdrop-blur-md z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          <span className="font-bold text-sm uppercase tracking-wider">Επιστροφή</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <div className="bg-[#1c1e24] rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
          {/* Image Section */}
          <div className="aspect-video bg-white flex items-center justify-center p-8 relative">
            {offer.imageUrl ? (
              <img src={offer.imageUrl} alt={offer.productName} className="w-full h-full object-contain" />
            ) : (
              <div className="text-slate-300 text-6xl">🏷️</div>
            )}
            
            <div className="absolute top-4 left-4">
              <div 
                className="px-3 py-1 rounded-lg text-xs font-black text-white shadow-lg"
                style={{ backgroundColor: offer.store?.color || '#888' }}
              >
                {offer.store?.name}
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">
                  {offer.category}
                </div>
                <h1 className="text-3xl font-black text-white leading-tight">
                  {offer.productName}
                </h1>
              </div>
              {offer.discountPercent && (
                <div className="bg-red-500 text-white font-black px-3 py-1 rounded-xl text-lg">
                  -{offer.discountPercent}%
                </div>
              )}
            </div>

            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              {offer.description || "Δεν υπάρχει διαθέσιμη περιγραφή για αυτό το προϊόν. Η προσφορά ισχύει μέχρι εξαντλήσεως των αποθεμάτων."}
            </p>

            {/* Price Row */}
            <div className="flex items-end gap-4 mb-8">
              <div>
                <div className="text-slate-500 text-[10px] font-bold uppercase mb-1">Τιμή Προσφοράς</div>
                <div className="text-4xl font-black text-white tracking-tighter">
                  {Number(offer.discountedPrice).toFixed(2)}€
                </div>
              </div>
              {offer.originalPrice && (
                <div className="mb-1">
                  <div className="text-slate-500 text-[10px] font-bold uppercase mb-1">Αρχική Τιμή</div>
                  <div className="text-slate-500 text-xl line-through font-medium">
                    {Number(offer.originalPrice).toFixed(2)}€
                  </div>
                </div>
              )}
            </div>

            {/* Meta Row */}
            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="text-slate-500 text-[10px] font-bold uppercase mb-1">Κατάστημα</div>
                <div className="text-white font-bold">{offer.store?.name}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="text-slate-500 text-[10px] font-bold uppercase mb-1">Λήξη Προσφοράς</div>
                <div className={`font-bold ${daysLeft <= 2 ? 'text-red-400' : 'text-white'}`}>
                  {daysLeft < 0 ? "Έχει λήξει" : daysLeft === 0 ? "Λήγει σήμερα" : `Σε ${daysLeft} ημέρες`}
                </div>
              </div>
            </div>

            {/* Action */}
            <button 
              onClick={handleAdd}
              disabled={added}
              className={`w-full py-5 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl ${
                added 
                  ? 'bg-green-600 text-white shadow-green-900/20' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/40'
              }`}
            >
              {added ? "✓ Προστέθηκε στη Λίστα" : "Προσθήκη στη Λίστα"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
