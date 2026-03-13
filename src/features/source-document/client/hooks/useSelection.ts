import { useState, useCallback } from "react";

interface UseSelectionOptions {
    allIds: string[];
}

export function useSelection({ allIds }: UseSelectionOptions) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const handleSelect = useCallback((id: string, selected: boolean) => {
        setSelectedIds(prev =>
            selected ? [...prev, id] : prev.filter(i => i !== id)
        );
    }, []);

    const handleSelectAll = useCallback((selected: boolean) => {
        setSelectedIds(selected ? allIds : []);
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

    return {
        selectedIds,
        isSelectionMode,
        isAllSelected: selectedIds.length === allIds.length && allIds.length > 0,
        selectedCount: selectedIds.length,
        handleSelect,
        handleSelectAll,
        toggleSelectionMode,
        clearSelection,
        exitSelectionMode,
    };
}
