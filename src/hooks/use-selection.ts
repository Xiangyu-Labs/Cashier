"use client";

import { useState, useCallback } from "react";

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
}

export function useSelection({ allIds }: UseSelectionOptions): UseSelectionReturn {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const isAllSelected = selectedIds.length === allIds.length && allIds.length > 0;
    const selectedCount = selectedIds.length;

    const handleSelect = useCallback((id: string, selected: boolean) => {
        setSelectedIds(prev =>
            selected ? [...prev, id] : prev.filter(i => i !== id)
        );
    }, []);

    const handleSelectAll = useCallback((selected: boolean) => {
        setSelectedIds(selected ? [...allIds] : []);
    }, [allIds]);

    const toggleSelectionMode = useCallback(() => {
        setIsSelectionMode(prev => {
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
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds([...allIds]);
    }, [allIds]);

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
    };
}
