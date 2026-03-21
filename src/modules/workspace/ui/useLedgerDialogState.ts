"use client";
import { useState } from "react";

export function useLedgerDialogState() {
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"ai" | "quick">("ai");
  const [isPendingOpen, setIsPendingOpen] = useState(false);

  function handleInputDialogChange(open: boolean) {
    setIsInputOpen(open);
    if (!open) {
      setInputMode("ai");
    }
  }

  return {
    isInputOpen,
    setIsInputOpen,
    inputMode,
    setInputMode,
    isPendingOpen,
    setIsPendingOpen,
    handleInputDialogChange,
  };
}
