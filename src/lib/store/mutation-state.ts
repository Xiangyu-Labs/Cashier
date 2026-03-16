import { create } from "zustand";

interface MutationState {
    /** Ledger-scoped active mutation counters */
    activeMutationsByLedger: Record<string, number>;
    /** Increment mutation counter for a specific ledger */
    incrementLedgerMutation: (ledgerId: string) => void;
    /** Decrement mutation counter for a specific ledger */
    decrementLedgerMutation: (ledgerId: string) => void;
    /** Check if a specific ledger has active mutations */
    hasActiveLedgerMutation: (ledgerId: string) => boolean;
}

/**
 * Ledger-scoped mutation state management
 *
 * Used to coordinate mutations and smart polling per ledger (tenant isolation).
 * When a mutation is active for a ledger, smart polling for that ledger pauses
 * to avoid overwriting optimistic updates.
 */
export const useMutationStore = create<MutationState>((set, get) => ({
    activeMutationsByLedger: {},

    incrementLedgerMutation: (ledgerId: string) =>
        set((state) => ({
            activeMutationsByLedger: {
                ...state.activeMutationsByLedger,
                [ledgerId]: (state.activeMutationsByLedger[ledgerId] || 0) + 1
            }
        })),

    decrementLedgerMutation: (ledgerId: string) =>
        set((state) => {
            const current = state.activeMutationsByLedger[ledgerId] || 0;
            if (current <= 0) return state;
            return {
                activeMutationsByLedger: {
                    ...state.activeMutationsByLedger,
                    [ledgerId]: current - 1
                }
            };
        }),

    hasActiveLedgerMutation: (ledgerId: string) => {
        return (get().activeMutationsByLedger[ledgerId] || 0) > 0;
    }
}));
