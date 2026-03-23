import { create } from 'zustand';

interface SelectionState {
  selectedCardIds: Set<string>;
  isSelectionMode: boolean;

  toggleCard: (cardId: string) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  selectAll: (cardIds: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedCardIds: new Set(),
  isSelectionMode: false,

  toggleCard: (cardId) =>
    set((state) => {
      const next = new Set(state.selectedCardIds);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return { selectedCardIds: next, isSelectionMode: next.size > 0 };
    }),

  selectCard: (cardId) =>
    set((state) => {
      const next = new Set(state.selectedCardIds);
      next.add(cardId);
      return { selectedCardIds: next, isSelectionMode: true };
    }),

  deselectCard: (cardId) =>
    set((state) => {
      const next = new Set(state.selectedCardIds);
      next.delete(cardId);
      return { selectedCardIds: next, isSelectionMode: next.size > 0 };
    }),

  clearSelection: () =>
    set({ selectedCardIds: new Set(), isSelectionMode: false }),

  selectAll: (cardIds) =>
    set({ selectedCardIds: new Set(cardIds), isSelectionMode: cardIds.length > 0 }),
}));
