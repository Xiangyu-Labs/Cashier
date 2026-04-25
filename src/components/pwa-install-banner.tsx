"use client";

import { useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, X } from "lucide-react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "cashier:pwa-dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function getInitialDismissedState(): boolean {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (dismissed != null) {
    const time = parseInt(dismissed, 10);
    return Date.now() - time < DISMISS_DURATION;
  }
  return false;
}

export function PWAInstallBanner() {
  const { isInstallable, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [isDismissed, setIsDismissed] = useState(getInitialDismissedState);
  const t = useTranslations("PWA");

  if (isStandalone || !isInstallable || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setIsDismissed(true);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t p-3 shadow-lg">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {isIOS ? t("iosInstallGuide") : t("installPrompt")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && (
            <button
              onClick={promptInstall}
              className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t("install")}
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label={t("dismiss")}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
