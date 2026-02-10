"use client";

import { useState, useEffect, useCallback } from "react";

export function useSelectionMode(allIds: string[]) {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // ESC key to exit selection mode
    useEffect(() => {
        if (!selectionMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setSelectedIds(new Set());
                setSelectionMode(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectionMode]);

    const toggleSelection = useCallback((entryId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(entryId)) {
                next.delete(entryId);
            } else {
                next.add(entryId);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(allIds));
    }, [allIds]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setSelectionMode(false);
    }, []);

    const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

    return {
        selectionMode,
        setSelectionMode,
        selectedIds,
        toggleSelection,
        selectAll,
        clearSelection,
        isAllSelected,
    };
}
