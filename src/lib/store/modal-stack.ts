import { create } from "zustand";

export type ModalItem =
  | { type: "source-document"; id: string }
  | { type: "ledger-entry"; id: string };

interface ModalStackState {
  stack: ModalItem[];
  push: (item: ModalItem) => void;
  pop: () => void;
  closeAll: () => void;

  // Helper to check if a specific ID is open (useful for ensuring we don't open duplicates if we don't want to)
  isOpen: (id: string) => boolean;
}

export const useModalStackStore = create<ModalStackState>((set, get) => ({
  stack: [],

  push: (item) =>
    set((state) => {
      // Optional: Prevent exact duplicates at the top of the stack
      const top = state.stack[state.stack.length - 1];
      if (top != null && top.type === item.type && top.id === item.id) {
        return state;
      }
      return { stack: [...state.stack, item] };
    }),

  pop: () =>
    set((state) => ({
      stack: state.stack.slice(0, -1),
    })),

  closeAll: () => set({ stack: [] }),

  isOpen: (id) => get().stack.some((item) => item.id === id),
}));
