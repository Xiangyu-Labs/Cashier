"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";

function hasActiveInteraction() {
  const active = document.activeElement;
  return (
    document.querySelector('[role="dialog"]') != null ||
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  );
}

export function ServiceWorkerUpdate() {
  const locale = useLocale();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || navigator.serviceWorker.controller == null) return;
    const handleControllerChange = () => {
      if (!hasActiveInteraction()) {
        location.reload();
        return;
      }
      toast(locale === "en" ? "A new version is ready" : "新版本已准备好", {
        duration: Infinity,
        action: {
          label: locale === "en" ? "Reload" : "刷新",
          onClick: () => location.reload(),
        },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, {
      once: true,
    });
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, [locale]);

  return null;
}
