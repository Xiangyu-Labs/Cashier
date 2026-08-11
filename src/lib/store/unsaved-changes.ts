import { create } from "zustand";

export interface UnsavedChangesLeaveGuard {
  requestLeave: (continueNavigation: () => void) => void;
}

interface UnsavedChangesState {
  dirtyKeys: Set<string>;
  leaveGuards: Map<string, UnsavedChangesLeaveGuard>;
  setDirty: (key: string, dirty: boolean) => void;
  registerLeaveGuard: (key: string, guard: UnsavedChangesLeaveGuard | null) => void;
  getLeaveGuard: (key: string) => UnsavedChangesLeaveGuard | null;
  hasDirtyChanges: () => boolean;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  dirtyKeys: new Set(),
  leaveGuards: new Map(),
  setDirty: (key, dirty) =>
    set((state) => {
      const dirtyKeys = new Set(state.dirtyKeys);
      if (dirty) dirtyKeys.add(key);
      else dirtyKeys.delete(key);
      return { dirtyKeys };
    }),
  registerLeaveGuard: (key, guard) =>
    set((state) => {
      const leaveGuards = new Map(state.leaveGuards);
      const dirtyKeys = new Set(state.dirtyKeys);
      if (guard == null) {
        leaveGuards.delete(key);
        dirtyKeys.delete(key);
      } else {
        leaveGuards.set(key, guard);
        dirtyKeys.add(key);
      }
      return { leaveGuards, dirtyKeys };
    }),
  getLeaveGuard: (key) => get().leaveGuards.get(key) ?? null,
  hasDirtyChanges: () => get().dirtyKeys.size > 0,
}));
