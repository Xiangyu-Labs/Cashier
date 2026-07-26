"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ShellControllerValue {
  onOpenInput: () => void;
  setOpenInput: (fn: () => void) => void;
}

const ShellControllerContext = createContext<ShellControllerValue | null>(null);

export function ShellControllerProvider({ children }: { children: ReactNode }) {
  const [onOpenInput, setOpenInput] = useState<() => void>(() => {});

  const value = useMemo(
    () => ({
      onOpenInput,
      setOpenInput,
    }),
    [onOpenInput]
  );

  return (
    <ShellControllerContext.Provider value={value}>
      {children}
    </ShellControllerContext.Provider>
  );
}

export function useShellController() {
  const ctx = useContext(ShellControllerContext);
  if (!ctx) throw new Error("useShellController must be used within ShellControllerProvider");
  return ctx;
}
