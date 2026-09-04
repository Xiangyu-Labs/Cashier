"use client";
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

interface ShellControllerValue {
  onOpenInput: () => void;
  registerOpenInput: (fn: () => void) => () => void;
  onInputIntent: () => void;
  registerInputIntent: (fn: () => void) => () => void;
}

const ShellControllerContext = createContext<ShellControllerValue | null>(null);

export function ShellControllerProvider({ children }: { children: ReactNode }) {
  const openInputRef = useRef<() => void>(() => {});
  const inputIntentRef = useRef<() => void>(() => {});
  const onOpenInput = useCallback(() => openInputRef.current(), []);
  const onInputIntent = useCallback(() => inputIntentRef.current(), []);
  const registerOpenInput = useCallback((handler: () => void) => {
    openInputRef.current = handler;
    return () => {
      if (openInputRef.current === handler) openInputRef.current = () => {};
    };
  }, []);
  const registerInputIntent = useCallback((handler: () => void) => {
    inputIntentRef.current = handler;
    return () => {
      if (inputIntentRef.current === handler) inputIntentRef.current = () => {};
    };
  }, []);

  const value = useMemo(
    () => ({
      onOpenInput,
      registerOpenInput,
      onInputIntent,
      registerInputIntent,
    }),
    [onInputIntent, onOpenInput, registerInputIntent, registerOpenInput]
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
