"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isStandalone, isIOS } from "@/lib/pwa-utils";

export interface UsePwaInstallReturn {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  promptInstall: () => void;
  isPrompting: boolean;
}

export function usePwaInstall(): UsePwaInstallReturn {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandaloneState, setIsStandaloneState] = useState(false);
  const [isIOSState, setIsIOSState] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const deferredPromptRef = useRef<Event | null>(null);

  useEffect(() => {
    const standalone = isStandalone();
    setIsStandaloneState(standalone);
    setIsIOSState(isIOS());

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      deferredPromptRef.current = null;
      setIsInstallable(false);
      setIsStandaloneState(true);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(() => {
    const prompt = deferredPromptRef.current;
    if (prompt == null) return;

    setIsPrompting(true);

    const promptFn = (prompt as unknown as { prompt: () => Promise<void> }).prompt;
    const userChoiceFn = (prompt as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice;

    if (typeof promptFn === "function") {
      Promise.resolve(promptFn()).catch(() => {
        // ignore
      });
    }

    if (userChoiceFn != null) {
      userChoiceFn
        .then(() => {
          setIsPrompting(false);
        })
        .catch(() => {
          setIsPrompting(false);
        });
    } else {
      setIsPrompting(false);
    }
  }, []);

  const effectiveInstallable = isInstallable || (isIOSState && !isStandaloneState);

  return {
    isInstallable: effectiveInstallable,
    isStandalone: isStandaloneState,
    isIOS: isIOSState,
    promptInstall,
    isPrompting,
  };
}
