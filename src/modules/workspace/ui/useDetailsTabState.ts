"use client";
import { useState, useCallback } from "react";
import type { LedgerEntry } from "@/modules/ledger/contracts";

export interface UseDetailsTabStateReturn {
  // Detail modal
  selectedLedgerEntry: LedgerEntry | null;
  setSelectedLedgerEntry: React.Dispatch<React.SetStateAction<LedgerEntry | null>>;
  isDetailModalOpen: boolean;
  setIsDetailModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  handleViewEntry: (entry: LedgerEntry) => void;
  handleCloseDetail: () => void;
}

export function useDetailsTabState(): UseDetailsTabStateReturn {
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleViewEntry = useCallback((entry: LedgerEntry) => {
    setSelectedLedgerEntry(entry);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedLedgerEntry(null);
  }, []);

  return {
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    isDetailModalOpen,
    setIsDetailModalOpen,
    handleViewEntry,
    handleCloseDetail,
  };
}
