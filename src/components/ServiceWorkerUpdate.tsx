"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

export function ServiceWorkerUpdate() {
  const t = useTranslations("ServiceWorkerUpdate");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let reloadRequested = false;
    let observedRegistration: ServiceWorkerRegistration | null = null;
    let observedInstalling: ServiceWorker | null = null;

    const showUpdate = (worker: ServiceWorker) => {
      toast(t("title"), {
        id: "service-worker-update",
        description: t("description"),
        duration: Infinity,
        action: {
          label: t("updateNow"),
          onClick: () => {
            if (useUnsavedChangesStore.getState().hasDirtyChanges()) {
              toast.error(t("dirtyBlocked"));
              showUpdate(worker);
              return;
            }
            reloadRequested = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
        cancel: {
          label: t("later"),
          onClick: () => showUpdate(worker),
        },
      });
    };

    const handleInstallingStateChange = () => {
      const installing = observedInstalling;
      if (
        installing?.state === "installed" &&
        navigator.serviceWorker.controller != null &&
        !disposed
      ) {
        showUpdate(installing);
      }
    };

    const handleUpdateFound = () => {
      observedInstalling?.removeEventListener("statechange", handleInstallingStateChange);
      observedInstalling = observedRegistration?.installing ?? null;
      observedInstalling?.addEventListener("statechange", handleInstallingStateChange);
    };

    const observeRegistration = (registration: ServiceWorkerRegistration) => {
      observedRegistration = registration;
      if (registration.waiting != null) showUpdate(registration.waiting);
      registration.addEventListener("updatefound", handleUpdateFound);
      if (registration.installing != null) handleUpdateFound();
    };

    void navigator.serviceWorker.ready
      .then((registration) => {
        if (!disposed) observeRegistration(registration);
      })
      .catch((error) => {
        if (!disposed) console.error("[ServiceWorkerUpdate] registration readiness failed", error);
      });

    const handleControllerChange = () => {
      if (reloadRequested) {
        location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, {
      once: false,
    });
    return () => {
      disposed = true;
      observedInstalling?.removeEventListener("statechange", handleInstallingStateChange);
      observedRegistration?.removeEventListener("updatefound", handleUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [t]);

  return null;
}
