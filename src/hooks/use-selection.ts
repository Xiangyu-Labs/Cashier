"use client";
import { useState, useCallback, useMemo } from "react";
import { useEffect } from "react";

interface UseSelectionOptions {
  allIds: string[];
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

export function useSelection({ allIds }: UseSelectionOptions): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const uniqueAllIds = useMemo(() => [...new Set(allIds)], [allIds]);

  const isAllSelected = selectedIds.length === uniqueAllIds.length && uniqueAllIds.length > 0;
  const selectedCount = selectedIds.length;

  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      if (selected) return prev.includes(id) ? prev : [...prev, id];
      return prev.includes(id) ? prev.filter((itemId) => itemId !== id) : prev;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      setSelectedIds(selected ? uniqueAllIds : []);
    },
    [uniqueAllIds]
  );

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedIds([]);
      }
      return !prev;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const setSelectionMode = useCallback((value: boolean) => {
    setIsSelectionMode(value);
    if (!value) {
      setSelectedIds([]);
    }
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(uniqueAllIds);
  }, [uniqueAllIds]);

  const retainSelection = useCallback((ids: string[]) => {
    setSelectedIds([...new Set(ids)]);
  }, []);

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
