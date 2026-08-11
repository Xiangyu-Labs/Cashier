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

    const observeRegistration = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting != null) showUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (installing == null) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller != null) {
            showUpdate(installing);
          }
        });
      });
    };

    void navigator.serviceWorker.ready.then((registration) => {
      if (!disposed) observeRegistration(registration);
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
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [t]);

  return null;
}
