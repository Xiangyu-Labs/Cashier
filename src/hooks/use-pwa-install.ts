"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isStandalone, isIOS } from "@/lib/pwa-utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

interface UsePwaInstallReturn {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  promptInstall: () => void;
  isPrompting: boolean;
}

export function usePwaInstall(): UsePwaInstallReturn {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandaloneState, setIsStandaloneState] = useState(() => isStandalone());
  const [isIOSState, setIsIOSState] = useState(() => isIOS());
  const [isPrompting, setIsPrompting] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = isStandalone();
    setIsStandaloneState(standalone);
    setIsIOSState(isIOS());

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
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

    deferredPromptRef.current = null; // prevent re-entry
    setIsInstallable(false); // remove installable state since prompt is consumed
    setIsPrompting(true);

    if (typeof prompt.prompt === "function") {
      Promise.resolve(prompt.prompt()).catch(() => {
        // ignore
      });
    }

    if (prompt.userChoice != null) {
      prompt.userChoice
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
