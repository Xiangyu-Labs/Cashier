"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ShellControllerValue {
  onOpenInput: () => void;
  setOpenInput: (fn: () => void) => void;
  onInputIntent: () => void;
  setInputIntent: (fn: () => void) => void;
}

const ShellControllerContext = createContext<ShellControllerValue | null>(null);

export function ShellControllerProvider({ children }: { children: ReactNode }) {
  const [onOpenInput, setOpenInput] = useState<() => void>(() => {});
  const [onInputIntent, setInputIntent] = useState<() => void>(() => {});

  const value = useMemo(
    () => ({
      onOpenInput,
      setOpenInput,
      onInputIntent,
      setInputIntent,
    }),
    [onInputIntent, onOpenInput]
  );

  return (
    <ShellControllerContext.Provider value={value}>{children}</ShellControllerContext.Provider>
  );
}

export function useShellController() {
  const ctx = useContext(ShellControllerContext);
  if (!ctx) throw new Error("useShellController must be used within ShellControllerProvider");
  return ctx;
}
