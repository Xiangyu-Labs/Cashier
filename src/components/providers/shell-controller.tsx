"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ShellControllerValue {
  ready: boolean;
  onOpenInput: () => void;
  registerOpenInput: (fn: () => void) => () => void;
  onInputIntent: () => void;
  registerInputIntent: (fn: () => void) => () => void;
}

const ShellControllerContext = createContext<ShellControllerValue | null>(null);

export function ShellControllerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const openInputRef = useRef<() => void>(() => {});
  const inputIntentRef = useRef<() => void>(() => {});
  const onOpenInput = useCallback(() => openInputRef.current(), []);
  const onInputIntent = useCallback(() => inputIntentRef.current(), []);
  const registerOpenInput = useCallback((handler: () => void) => {
    openInputRef.current = handler;
    setReady(true);
    return () => {
      if (openInputRef.current === handler) {
        openInputRef.current = () => {};
        setReady(false);
      }
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
      ready,
      onOpenInput,
      registerOpenInput,
      onInputIntent,
      registerInputIntent,
    }),
    [ready, onInputIntent, onOpenInput, registerInputIntent, registerOpenInput]
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
