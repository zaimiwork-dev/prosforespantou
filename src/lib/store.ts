import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SUPERMARKETS } from './constants';

/**
 * Zustand store for managing the user's shopping list.
 * Now includes centralized formatting logic for professional sharing.
 */
interface ShoppingItem {
  id: string;
  productName?: string;
  product_name?: string;
  discountedPrice?: number;
  discounted_price?: number;
  quantity?: number;
  supermarket?: string;
  supermarket_id?: string;
  product?: {
    name?: string;
  };
}

interface ShoppingListState {
  items: ShoppingItem[];
  preferredStores: string[];
  addItem: (product: any) => void;
  removeItem: (id: string) => void;
  decreaseItem: (id: string) => void;
  clearList: () => void;
  togglePreferred: (id: string) => void;
  clearPreferred: () => void;
  getShareText: () => string;
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set, get) => ({
      items: [],
      preferredStores: [],
      
      addItem: (product) => set((state) => {
        const existing = state.items.find(i => i.id === product.id);
        if (existing) {
          return {
            items: state.items.map(i => 
              i.id === product.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i
            )
          };
        }
        return { items: [...state.items, { ...product, quantity: 1 }] };
      }),

      removeItem: (id) => set((state) => ({
        items: state.items.filter(i => i.id !== id),
      })),

      decreaseItem: (id) => set((state) => ({
        items: state.items.map(i => 
          i.id === id ? { ...i, quantity: Math.max(0, (i.quantity || 1) - 1) } : i
        ).filter(i => (i.quantity || 0) > 0)
      })),

      clearList: () => set({ items: [] }),

      togglePreferred: (id) => set((state) => ({
        preferredStores: state.preferredStores.includes(id)
          ? state.preferredStores.filter((s) => s !== id)
          : [...state.preferredStores, id],
      })),

      clearPreferred: () => set({ preferredStores: [] }),

      /**
       * Centralized logic to generate a professional share message.
       */
      getShareText: () => {
        const items = get().items;
        if (items.length === 0) return "";

        const total = items.reduce((sum, item) => 
          sum + (Number(item.discountedPrice || item.discounted_price) * (item.quantity || 1)), 0
        ).toFixed(2);

        const itemsList = items.map(item => {
          const sm = SUPERMARKETS.find(s => s.id === (item.supermarket || item.supermarket_id));
          const name = item.product?.name || item.productName || item.product_name;
          const qty = item.quantity || 1;
          const price = (Number(item.discountedPrice || item.discounted_price) * qty).toFixed(2);
          return `• ${qty}x ${name} (${sm?.short || 'SM'}) - ${price}€`;
        }).join('\n');

        return `🏷️ ΠΡΟΣΦΟΡΕΣ ΠΑΝΤΟΥ - Η Λίστα Μου\n\n${itemsList}\n\n💰 ΣΥΝΟΛΙΚΟ ΚΟΣΤΟΣ: ${total}€\n\nΔες περισσότερα στο: ${window.location.origin}`;
      }
    }),
    {
      name: 'prosfores-pantou-list',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
