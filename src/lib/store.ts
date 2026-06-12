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

// A favourited product ("my staples"). Keyed by the canonical productId when
// the offer is matched, else by name+chain — so an unmatched offer can still
// be saved and keeps working once the resolver claims it.
export interface FavoriteItem {
  key: string;
  productId: string | null;
  productName: string;
  supermarket?: string | null;
}

export function favoriteKeyFor(offer: { productId?: string | null; product_id?: string | null; productName?: string | null; product_name?: string | null; supermarket?: string | null; supermarket_id?: string | null }): string {
  const pid = offer.productId ?? offer.product_id;
  if (pid) return `p:${pid}`;
  const name = offer.productName ?? offer.product_name ?? '';
  return `n:${name.toLowerCase()}|${offer.supermarket ?? offer.supermarket_id ?? ''}`;
}

interface ShoppingListState {
  items: ShoppingItem[];
  preferredStores: string[];
  // Departments the user told us they usually buy (first-visit onboarding /
  // the preferences sheet). Declared interest — ranks above learned signals.
  preferredCategories: string[];
  favorites: FavoriteItem[];
  addItem: (product: any) => void;
  removeItem: (id: string) => void;
  decreaseItem: (id: string) => void;
  clearList: () => void;
  togglePreferred: (id: string) => void;
  clearPreferred: () => void;
  togglePreferredCategory: (id: string) => void;
  toggleFavorite: (offer: any) => void;
  getShareText: () => string;
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set, get) => ({
      items: [],
      preferredStores: [],
      preferredCategories: [],
      favorites: [],
      
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

      togglePreferredCategory: (id) => set((state) => ({
        preferredCategories: state.preferredCategories.includes(id)
          ? state.preferredCategories.filter((c) => c !== id)
          : [...state.preferredCategories, id],
      })),

      toggleFavorite: (offer) => set((state) => {
        const key = favoriteKeyFor(offer);
        if (state.favorites.some((f) => f.key === key)) {
          return { favorites: state.favorites.filter((f) => f.key !== key) };
        }
        const fav: FavoriteItem = {
          key,
          productId: offer.productId ?? offer.product_id ?? null,
          productName: offer.productName ?? offer.product_name ?? offer.product?.name ?? '',
          supermarket: offer.supermarket ?? offer.supermarket_id ?? null,
        };
        return { favorites: [...state.favorites, fav] };
      }),

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
