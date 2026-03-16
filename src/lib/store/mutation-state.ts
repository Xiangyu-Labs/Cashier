import { create } from "zustand";

interface MutationState {
    /** 当前活跃的ledger-scoped mutation计数 */
    activeLedgerMutationCount: number;
    /** 增加mutation计数 */
    incrementLedgerMutation: () => void;
    /** 减少mutation计数 */
    decrementLedgerMutation: () => void;
    /** 是否有活跃的ledger mutation */
    hasActiveLedgerMutation: () => boolean;
}

/**
 * 全局mutation状态管理
 *
 * 用于协调多个mutation和智能轮询之间的竞争条件。
 * 当mutation正在进行时，智能轮询应该暂停以避免覆盖乐观更新。
 */
export const useMutationStore = create<MutationState>((set, get) => ({
    activeLedgerMutationCount: 0,

    incrementLedgerMutation: () =>
        set((state) => ({
            activeLedgerMutationCount: state.activeLedgerMutationCount + 1
        })),

    decrementLedgerMutation: () =>
        set((state) => ({
            activeLedgerMutationCount: Math.max(0, state.activeLedgerMutationCount - 1)
        })),

    hasActiveLedgerMutation: () => get().activeLedgerMutationCount > 0,
}));
