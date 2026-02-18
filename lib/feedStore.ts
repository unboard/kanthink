import { create } from 'zustand';
import type { ID, FeedCard } from './types';

interface FeedState {
  feedCards: Record<ID, FeedCard>;
  feedCardOrder: ID[];
  activeFilter: 'all' | ID;  // 'all' = For You, or a channelId
  isGenerating: boolean;
  isLoadingMore: boolean;
  selectedFeedCardId: ID | null;
  savingFeedCardId: ID | null;  // Card being saved to a channel
  shownCardIds: string[];       // Titles already shown (for dedup)

  // Actions
  setFeedCards: (cards: FeedCard[]) => void;
  appendFeedCards: (cards: FeedCard[]) => void;
  setActiveFilter: (filter: 'all' | ID) => void;
  selectFeedCard: (id: ID | null) => void;
  setSavingFeedCard: (id: ID | null) => void;
  removeFeedCard: (id: ID) => void;
  markCardSaved: (id: ID) => void;
  setIsGenerating: (v: boolean) => void;
  setIsLoadingMore: (v: boolean) => void;
  clearFeed: () => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  feedCards: {},
  feedCardOrder: [],
  activeFilter: 'all',
  isGenerating: false,
  isLoadingMore: false,
  selectedFeedCardId: null,
  savingFeedCardId: null,
  shownCardIds: [],

  setFeedCards: (cards) =>
    set(() => {
      const feedCards: Record<ID, FeedCard> = {};
      const feedCardOrder: ID[] = [];
      for (const card of cards) {
        feedCards[card.id] = card;
        feedCardOrder.push(card.id);
      }
      return {
        feedCards,
        feedCardOrder,
        shownCardIds: cards.map((c) => c.title),
      };
    }),

  appendFeedCards: (cards) =>
    set((state) => {
      const feedCards = { ...state.feedCards };
      const feedCardOrder = [...state.feedCardOrder];
      const shownCardIds = [...state.shownCardIds];
      for (const card of cards) {
        feedCards[card.id] = card;
        feedCardOrder.push(card.id);
        shownCardIds.push(card.title);
      }
      return { feedCards, feedCardOrder, shownCardIds };
    }),

  setActiveFilter: (filter) =>
    set(() => ({
      activeFilter: filter,
      feedCards: {},
      feedCardOrder: [],
      shownCardIds: [],
      selectedFeedCardId: null,
    })),

  selectFeedCard: (id) => set({ selectedFeedCardId: id }),

  setSavingFeedCard: (id) => set({ savingFeedCardId: id }),

  removeFeedCard: (id) =>
    set((state) => {
      const { [id]: _, ...feedCards } = state.feedCards;
      return {
        feedCards,
        feedCardOrder: state.feedCardOrder.filter((fid) => fid !== id),
      };
    }),

  markCardSaved: (id) =>
    set((state) => {
      const card = state.feedCards[id];
      if (!card) return {};
      return {
        feedCards: {
          ...state.feedCards,
          [id]: { ...card, _saved: true } as FeedCard & { _saved?: boolean },
        },
      };
    }),

  setIsGenerating: (v) => set({ isGenerating: v }),
  setIsLoadingMore: (v) => set({ isLoadingMore: v }),

  clearFeed: () =>
    set({
      feedCards: {},
      feedCardOrder: [],
      shownCardIds: [],
      selectedFeedCardId: null,
      isGenerating: false,
      isLoadingMore: false,
    }),
}));
