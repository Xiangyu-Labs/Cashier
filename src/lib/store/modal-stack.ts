import { create } from "zustand";

export type ModalItem =
  | { type: "source-document"; id: string; ledgerId: string; returnFocus?: HTMLElement | null }
  | { type: "ledger-entry"; id: string; ledgerId: string; returnFocus?: HTMLElement | null };

interface ModalStackState {
  stack: ModalItem[];
  canGoBack: boolean;
  push: (item: ModalItem) => void;
  pop: () => void;
  closeAll: () => void;
  syncToDetail: (item: ModalItem | null) => void;

  // Helper to check if a specific ID is open (useful for ensuring we don't open duplicates if we don't want to)
  isOpen: (id: string) => boolean;
}

export const useModalStackStore = create<ModalStackState>((set, get) => ({
  stack: [],
  canGoBack: false,

  push: (item) =>
    set((state) => {
      const existingIndex = state.stack.findIndex(
        (existing) =>
          existing.type === item.type &&
          existing.id === item.id &&
          existing.ledgerId === item.ledgerId
      );
      const stack =
        existingIndex === -1 ? [...state.stack, item] : state.stack.slice(0, existingIndex + 1);
      return { stack, canGoBack: stack.length > 1 };
    }),

  pop: () =>
    set((state) => {
      const stack = state.stack.slice(0, -1);
      return { stack, canGoBack: stack.length > 1 };
    }),

  closeAll: () => set({ stack: [], canGoBack: false }),

  syncToDetail: (item) =>
    set((state) => {
      if (item == null) return { stack: [], canGoBack: false };
      const existingIndex = state.stack.findIndex(
        (existing) =>
          existing.type === item.type &&
          existing.id === item.id &&
          existing.ledgerId === item.ledgerId
      );
      const stack = existingIndex === -1 ? [item] : state.stack.slice(0, existingIndex + 1);
      return { stack, canGoBack: stack.length > 1 };
    }),

  isOpen: (id) => get().stack.some((item) => item.id === id),
}));
