"use client";

import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

export function PWAInstallButton() {
  const { isInstallable, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const t = useTranslations("PWA");

  if (isStandalone || !isInstallable) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("installTitle")}</h2>
        <p className="text-xs text-muted-foreground">
          {isIOS ? t("iosInstallGuide") : t("installDesc")}
        </p>
      </div>
      {isIOS ? (
        <div className="shrink-0 p-2 text-muted-foreground">
          <Smartphone className="h-5 w-5" />
        </div>
      ) : (
        <button
          onClick={promptInstall}
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          {t("installApp")}
        </button>
      )}
    </div>
  );
}
