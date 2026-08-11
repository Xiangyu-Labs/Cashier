"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

interface UseSelectionOptions {
  allIds: string[];
  queryFingerprint?: string | null;
}

interface UseSelectionReturn {
  selectedIds: string[];
  isSelectionMode: boolean;
  isAllSelected: boolean;
  selectedCount: number;
  handleSelect: (id: string, selected: boolean) => void;
  handleSelectAll: (selected: boolean) => void;
  toggleSelectionMode: () => void;
  clearSelection: () => void;
  exitSelectionMode: () => void;
  setSelectionMode: (value: boolean) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  retainSelection: (ids: string[]) => void;
}

interface SelectionState {
  queryFingerprint: string | null | undefined;
  selectedIds: string[];
  isSelectionMode: boolean;
}

export function useSelection({
  allIds,
  queryFingerprint,
}: UseSelectionOptions): UseSelectionReturn {
  const [selection, setSelection] = useState<SelectionState>(() => ({
    queryFingerprint,
    selectedIds: [],
    isSelectionMode: false,
  }));
  const uniqueAllIds = useMemo(() => [...new Set(allIds)], [allIds]);

  if (selection.queryFingerprint !== queryFingerprint) {
    setSelection({
      queryFingerprint,
      selectedIds: [],
      isSelectionMode: false,
    });
  }

  const selectedIds = selection.queryFingerprint === queryFingerprint ? selection.selectedIds : [];
  const isSelectionMode =
    selection.queryFingerprint === queryFingerprint ? selection.isSelectionMode : false;
  const isAllSelected = selectedIds.length === uniqueAllIds.length && uniqueAllIds.length > 0;
  const selectedCount = selectedIds.length;

  const handleSelect = useCallback(
    (id: string, selected: boolean) => {
      setSelection((current) => {
        const selectedIds =
          current.queryFingerprint === queryFingerprint ? current.selectedIds : [];
        const nextIds = selected
          ? selectedIds.includes(id)
            ? selectedIds
            : [...selectedIds, id]
          : selectedIds.includes(id)
            ? selectedIds.filter((itemId) => itemId !== id)
            : selectedIds;
        return {
          queryFingerprint,
          selectedIds: nextIds,
          isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
        };
      });
    },
    [queryFingerprint]
  );

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      setSelection((current) => ({
        queryFingerprint,
        selectedIds: selected ? uniqueAllIds : [],
        isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
      }));
    },
    [queryFingerprint, uniqueAllIds]
  );

  const toggleSelectionMode = useCallback(() => {
    setSelection((current) => {
      const wasSelectionMode =
        current.queryFingerprint === queryFingerprint && current.isSelectionMode;
      return {
        queryFingerprint,
        selectedIds:
          wasSelectionMode || current.queryFingerprint !== queryFingerprint
            ? []
            : current.selectedIds,
        isSelectionMode: !wasSelectionMode,
      };
    });
  }, [queryFingerprint]);

  const clearSelection = useCallback(() => {
    setSelection((current) => ({
      queryFingerprint,
      selectedIds: [],
      isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
    }));
  }, [queryFingerprint]);

  const exitSelectionMode = useCallback(() => {
    setSelection({
      queryFingerprint,
      selectedIds: [],
      isSelectionMode: false,
    });
  }, [queryFingerprint]);

  const setSelectionMode = useCallback(
    (value: boolean) => {
      setSelection((current) => ({
        queryFingerprint,
        selectedIds:
          value && current.queryFingerprint === queryFingerprint ? current.selectedIds : [],
        isSelectionMode: value,
      }));
    },
    [queryFingerprint]
  );

  const toggleSelection = useCallback(
    (id: string) => {
      setSelection((current) => {
        const selectedIds =
          current.queryFingerprint === queryFingerprint ? current.selectedIds : [];
        return {
          queryFingerprint,
          selectedIds: selectedIds.includes(id)
            ? selectedIds.filter((selectedId) => selectedId !== id)
            : [...selectedIds, id],
          isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
        };
      });
    },
    [queryFingerprint]
  );

  const selectAll = useCallback(() => {
    setSelection((current) => ({
      queryFingerprint,
      selectedIds: uniqueAllIds,
      isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
    }));
  }, [queryFingerprint, uniqueAllIds]);

  const retainSelection = useCallback(
    (ids: string[]) => {
      setSelection((current) => ({
        queryFingerprint,
        selectedIds: [...new Set(ids)],
        isSelectionMode: current.queryFingerprint === queryFingerprint && current.isSelectionMode,
      }));
    },
    [queryFingerprint]
  );

  useEffect(() => {
    if (!isSelectionMode) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      // Radix handles Escape for the topmost Dialog, Popover, Select, or
      // DropdownMenu first. Keep the underlying selection mode intact while
      // any such layer is open, including nested image viewers/confirmations.
      const openLayer = document.querySelector(
        [
          '[data-radix-dialog-content][data-state="open"]',
          '[data-radix-alert-dialog-content][data-state="open"]',
          '[data-radix-popover-content][data-state="open"]',
          '[data-radix-select-content][data-state="open"]',
          '[data-radix-menu-content][data-state="open"]',
          '[role="dialog"][data-state="open"]',
        ].join(", ")
      );
      if (openLayer != null) return;

      event.preventDefault();
      exitSelectionMode();
    };

    // Bubble phase is intentional: nested Radix layers retain priority.
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [exitSelectionMode, isSelectionMode]);

  return {
    selectedIds,
    isSelectionMode,
    isAllSelected,
    selectedCount,
    handleSelect,
    handleSelectAll,
    toggleSelectionMode,
    clearSelection,
    exitSelectionMode,
    setSelectionMode,
    toggleSelection,
    selectAll,
    retainSelection,
  };
}
