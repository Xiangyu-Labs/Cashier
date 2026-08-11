"use client";
import { useState } from "react";

export function useLedgerDialogState() {
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"ai" | "quick">("ai");

  function handleInputDialogChange(open: boolean) {
    setIsInputOpen(open);
  }

  return {
    isInputOpen,
    setIsInputOpen,
    inputMode,
    setInputMode,
    handleInputDialogChange,
  };
}
