import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Zustand store for managing the user's shopping list with quantity support.
 */
export const useShoppingListStore = create()(
  persist(
    (set) => ({
      items: [],
      
      /**
       * Adds an item or increments quantity if it already exists.
       */
      addItem: (item) => set((state) => {
        const existingItem = state.items.find(i => i.id === item.id);
        
        if (existingItem) {
          return {
            items: state.items.map(i => 
              i.id === item.id 
                ? { ...i, quantity: (i.quantity || 1) + 1 } 
                : i
            )
          };
        }
        
        return { items: [...state.items, { ...item, quantity: 1 }] };
      }),
      
      /**
       * Decrements quantity or removes item if quantity is 1.
       */
      decreaseItem: (id) => set((state) => {
        const existingItem = state.items.find(i => i.id === id);
        
        if (existingItem && existingItem.quantity > 1) {
          return {
            items: state.items.map(i => 
              i.id === id 
                ? { ...i, quantity: i.quantity - 1 } 
                : i
            )
          };
        }
        
        return { items: state.items.filter(i => i.id !== id) };
      }),
      
      /**
       * Removes a specific item entirely regardless of quantity.
       */
      removeItem: (id) => set((state) => ({
        items: state.items.filter(i => i.id !== id),
      })),
      
      /**
       * Clears all items.
       */
      clearList: () => set({ items: [] }),
    }),
    {
      name: 'prosfores-pantou-list',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
