"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

const UPDATE_TOAST_ID = "service-worker-update";

export function ServiceWorkerUpdate() {
  const queryClient = useQueryClient();
  const t = useTranslations("ServiceWorkerUpdate");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let activating = false;
    let reloaded = false;
    let controllerChanged = false;
    let checking = false;
    let registration: ServiceWorkerRegistration | null = null;
    let installing: ServiceWorker | null = null;
    let port: MessagePort | null = null;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let hasEstablishedController = navigator.serviceWorker.controller != null;
    const safeToUpdate = () =>
      !disposed &&
      document.visibilityState === "visible" &&
      navigator.onLine &&
      !useUnsavedChangesStore.getState().hasDirtyChanges() &&
      queryClient.isMutating() === 0 &&
      queryClient.isFetching() === 0 &&
      document.documentElement.dataset.batchSelection !== "true" &&
      document.querySelector('[role="dialog"][data-state="open"], [data-update-blocked="true"]') ==
        null &&
      !(
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches("input, textarea, [contenteditable=true]")
      );
    const releaseRequest = () => {
      clearTimeout(requestTimeout);
      port?.close();
      port = null;
      activating = false;
    };
    const showUpdate = (worker: ServiceWorker | null) => {
      if (disposed || !hasEstablishedController) return;
      toast(t("title"), {
        id: UPDATE_TOAST_ID,
        description: t("description"),
        duration: Infinity,
        action: {
          label: t("updateNow"),
          onClick: () => {
            if (!safeToUpdate()) {
              toast.error(t("dirtyBlocked"));
              showUpdate(worker);
              return;
            }
            toast(t("updating"), { id: UPDATE_TOAST_ID, duration: Infinity });
            if (controllerChanged || worker == null) {
              reloaded = true;
              window.location.reload();
              return;
            }
            worker.postMessage({ type: "ACTIVATE_NOW" });
          },
        },
        cancel: {
          label: t("later"),
          onClick: () => toast.dismiss(UPDATE_TOAST_ID),
        },
      });
    };
    const tryUpdate = () => {
      if (reloaded) return;
      if (!safeToUpdate()) {
        if (controllerChanged || registration?.waiting != null) {
          showUpdate(registration?.waiting ?? null);
        }
        return;
      }
      if (controllerChanged) {
        reloaded = true;
        toast.dismiss(UPDATE_TOAST_ID);
        window.location.reload();
        return;
      }
      const worker = registration?.waiting;
      if (worker == null || navigator.serviceWorker.controller == null || activating) return;
      activating = true;
      const channel = new MessageChannel();
      port = channel.port1;
      requestTimeout = setTimeout(releaseRequest, 5_000);
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        if (!safeToUpdate() || registration?.waiting !== worker) {
          releaseRequest();
          showUpdate(worker);
          return;
        }
        if (event.data !== 1) {
          releaseRequest();
          showUpdate(worker);
          return;
        }
        channel.port1.close();
        port = null;
        worker.postMessage({ type: "ACTIVATE_SINGLE_WINDOW" });
      };
      // The waiting worker supports this even when the active app predates the protocol.
      worker.postMessage({ type: "GET_WINDOW_COUNT" }, [channel.port2]);
    };
    const checkUpdate = async () => {
      if (registration == null || checking || disposed || !navigator.onLine) return;
      checking = true;
      try {
        await registration.update();
      } catch {
        // An unavailable update must not prevent using the current application.
      } finally {
        checking = false;
        tryUpdate();
      }
    };
    const onForeground = () => {
      if (document.visibilityState === "visible") void checkUpdate();
    };
    const onUpdateFound = () => {
      installing?.removeEventListener("statechange", tryUpdate);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", tryUpdate);
    };
    const onControllerChange = () => {
      if (!hasEstablishedController) {
        hasEstablishedController = navigator.serviceWorker.controller != null;
        return;
      }
      controllerChanged = true;
      releaseRequest();
      tryUpdate();
    };
    void navigator.serviceWorker.ready
      .then((ready) => {
        if (disposed) return;
        registration = ready;
        registration.addEventListener("updatefound", onUpdateFound);
        onUpdateFound();
        tryUpdate();
        void checkUpdate();
      })
      .catch(() => undefined);
    const unsubscribeDirty = useUnsavedChangesStore.subscribe(tryUpdate);
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      tryUpdate();
      if (event.type === "updated" && event.action.type === "error") void checkUpdate();
    });
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      tryUpdate();
      if (event.type === "updated" && event.action.type === "error") void checkUpdate();
    });
    const observer = new MutationObserver(tryUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-update-blocked"],
    });
    const interval = setInterval(() => void checkUpdate(), 60_000);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("online", onForeground);
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    document.addEventListener("focusout", tryUpdate);
    return () => {
      disposed = true;
      toast.dismiss(UPDATE_TOAST_ID);
      releaseRequest();
      clearInterval(interval);
      observer.disconnect();
      unsubscribeDirty();
      unsubscribeMutations();
      unsubscribeQueries();
      installing?.removeEventListener("statechange", tryUpdate);
      registration?.removeEventListener("updatefound", onUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("online", onForeground);
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
      document.removeEventListener("focusout", tryUpdate);
    };
  }, [queryClient, t]);
  return null;
}
