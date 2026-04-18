'use client';

import { useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useShoppingListStore } from '@/lib/store';
import { SUPERMARKETS } from '@/lib/constants';
import { Icon } from './Icons';

export function ShoppingList({ isOpen, onClose }) {
  const { items, addItem, decreaseItem, clearList, getShareText } = useShoppingListStore();

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const smId = item.supermarket || item.supermarket_id;
      if (!map.has(smId)) map.set(smId, { smId, items: [], subtotal: 0 });
      const g = map.get(smId);
      g.items.push(item);
      g.subtotal += Number(item.discountedPrice || item.discounted_price) * (item.quantity || 1);
    }
    return [...map.values()].sort((a, b) => b.subtotal - a.subtotal);
  }, [items]);

  const total = groups.reduce((s, g) => s + g.subtotal, 0);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleShare = async () => {
    const text = getShareText();
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Η λίστα με τις προσφορές μου', text, url: window.location.origin });
      } catch (err) { console.error('Error sharing:', err); }
    } else {
      await navigator.clipboard.writeText(text);
      alert('Η λίστα αντιγράφηκε στο πρόχειρο!');
    }
  };

  const handleClear = () => {
    if (confirm('Εκκαθάριση λίστας;')) clearList();
  };

  return (
    <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Η λίστα μου</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Κλείσιμο">
            <Icon.X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="drawer-empty">
              <div className="empty-ico"><Icon.Bag size={24} /></div>
              <p>Η λίστα σου είναι άδεια</p>
            </div>
          ) : (
            <>
              {groups.length > 1 && (
                <div className="drawer-multistore">
                  Η λίστα σου απλώνεται σε <b>{groups.length} σούπερ μάρκετ</b>.
                  Παρακάτω χωρίζεται ανά κατάστημα με επιμέρους σύνολο.
                </div>
              )}

              {groups.map((g) => {
                const sm = SUPERMARKETS.find((s) => s.id === g.smId);
                return (
                  <div key={g.smId} className="list-group">
                    <div className="list-group-head" style={{ background: sm?.color || 'var(--ink-2)' }}>
                      <span>{sm?.name || g.smId}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{g.subtotal.toFixed(2)}€</span>
                    </div>
                    <div className="list-group-body">
                      {g.items.map((item) => {
                        const name = item.product?.name || item.productName || item.product_name;
                        let img = item.product?.imageUrl || item.imageUrl || item.image_url;
                        if (img && !img.startsWith('http') && !img.startsWith('/')) {
                          img = `/wolt_images/${img.split('/').pop()}`;
                        }
                        const price = Number(item.discountedPrice || item.discounted_price);
                        return (
                          <div key={item.id} className="list-item">
                            <div className="list-item-img">
                              {img ? (
                                <Image src={img} alt="" fill sizes="44px" style={{ objectFit: 'contain' }} />
                              ) : (
                                <Icon.Bag size={18} />
                              )}
                            </div>
                            <div className="list-item-body">
                              <h4 className="list-item-name">{name}</h4>
                              <div className="list-item-price">{(price * (item.quantity || 1)).toFixed(2)}€</div>
                            </div>
                            <div className="qty-stepper">
                              <button type="button" onClick={() => decreaseItem(item.id)} aria-label="Μείωση">
                                <Icon.Minus size={12} />
                              </button>
                              <span className="qty-val">{item.quantity}</span>
                              <button type="button" onClick={() => addItem(item)} aria-label="Αύξηση">
                                <Icon.Plus size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="drawer-foot">
            <div className="drawer-totals">
              <span className="lbl">Συνολικό κόστος</span>
              <span className="val">{total.toFixed(2)}€</span>
            </div>
            <div className="drawer-actions">
              <button type="button" className="btn btn-primary" onClick={handleShare}>
                <Icon.Share size={14} /> Κοινοποίηση
              </button>
              <button type="button" className="btn btn-outline" onClick={handleClear}>
                <Icon.Trash size={14} /> Άδειασμα
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
