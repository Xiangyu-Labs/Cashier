"use client";

import { useState, useCallback } from "react";
import type { LedgerEntry } from "@/types/api";

export interface UseDetailsTabStateReturn {
  // Delete confirmation
  deleteConfirm: { open: boolean; id: string | null };
  setDeleteConfirm: React.Dispatch<React.SetStateAction<{ open: boolean; id: string | null }>>;

  // Detail modal
  selectedLedgerEntry: LedgerEntry | null;
  setSelectedLedgerEntry: React.Dispatch<React.SetStateAction<LedgerEntry | null>>;
  isDetailModalOpen: boolean;
  setIsDetailModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  handleDeleteConfirm: (onDelete: (id: string) => void) => void;
  handleViewEntry: (entry: LedgerEntry) => void;
  handleCloseDetail: () => void;
}

export function useDetailsTabState(): UseDetailsTabStateReturn {
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleDeleteConfirm = useCallback((onDelete: (id: string) => void) => {
    if (deleteConfirm.id) {
      onDelete(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null });
    }
  }, [deleteConfirm.id]);

  const handleViewEntry = useCallback((entry: LedgerEntry) => {
    setSelectedLedgerEntry(entry);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedLedgerEntry(null);
  }, []);

  return {
    deleteConfirm,
    setDeleteConfirm,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    isDetailModalOpen,
    setIsDetailModalOpen,
    handleDeleteConfirm,
    handleViewEntry,
    handleCloseDetail,
  };
}
