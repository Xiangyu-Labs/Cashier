import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

describe("ServiceWorkerUpdate", () => {
  let count = 1;
  let client: QueryClient;
  let worker: { postMessage: ReturnType<typeof vi.fn> };
  let registration: EventTarget & {
    waiting: typeof worker | null;
    installing: null;
    update: ReturnType<typeof vi.fn>;
  };
  let serviceWorker: EventTarget & {
    ready: Promise<typeof registration>;
    controller: object | null;
  };
  beforeEach(() => {
    count = 1;
    client = new QueryClient();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1 = { onmessage: null as null | ((event: { data: number }) => void), close: vi.fn() };
        port2 = { reply: () => this.port1.onmessage?.({ data: count }) };
      }
    );
    worker = {
      postMessage: vi.fn((data: { type: string }, ports?: { reply: () => void }[]) => {
        if (data.type === "GET_WINDOW_COUNT") queueMicrotask(() => ports?.[0]?.reply());
      }),
    };
    registration = Object.assign(new EventTarget(), {
      waiting: worker as typeof worker | null,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    serviceWorker = Object.assign(new EventTarget(), {
      ready: Promise.resolve(registration),
      controller: {} as object | null,
    });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });
  afterEach(() => {
    cleanup();
    client.clear();
    useUnsavedChangesStore.setState({ dirtyKeys: new Set(), leaveGuards: new Map() });
    Reflect.deleteProperty(navigator, "serviceWorker");
    document.querySelector('[role="dialog"]')?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const mount = () =>
    render(
      <QueryClientProvider client={client}>
        <ServiceWorkerUpdate />
      </QueryClientProvider>
    );

  it("checks immediately, activates a ready update and reloads only once", async () => {
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    mount();
    await waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" })
    );
    expect(registration.update).toHaveBeenCalledOnce();
    act(() => {
      serviceWorker.dispatchEvent(new Event("controllerchange"));
      serviceWorker.dispatchEvent(new Event("controllerchange"));
    });
    expect(reload).toHaveBeenCalledOnce();
  });
  it("defers dirty editors until changes are saved or discarded", async () => {
    useUnsavedChangesStore.getState().setDirty("editor", true);
    mount();
    await waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    expect(worker.postMessage).not.toHaveBeenCalled();
    act(() => useUnsavedChangesStore.getState().setDirty("editor", false));
    await waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" })
    );
  });
  it("waits for open dialogs to close", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.dataset.state = "open";
    document.body.append(dialog);
    mount();
    await waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    expect(worker.postMessage).not.toHaveBeenCalled();
    act(() => dialog.remove());
    await waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" })
    );
  });
  it("does not activate while another application window is open", async () => {
    count = 2;
    mount();
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" });
    count = 1;
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" })
    );
  });
  it("does not reload for first installation", async () => {
    serviceWorker.controller = null;
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    mount();
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    act(() => serviceWorker.dispatchEvent(new Event("controllerchange")));
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits for a mutation and rechecks safety after receiving the window count", async () => {
    const isMutating = vi.spyOn(client, "isMutating").mockReturnValue(1);
    mount();
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
    expect(worker.postMessage).not.toHaveBeenCalled();
    isMutating.mockReturnValue(0);
    worker.postMessage.mockImplementation(
      (data: { type: string }, ports?: { reply: () => void }[]) => {
        if (data.type === "GET_WINDOW_COUNT") {
          useUnsavedChangesStore.getState().setDirty("editor", true);
          ports?.[0]?.reply();
        }
      }
    );
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: "ACTIVATE_SINGLE_WINDOW" });
  });

  it("does not check or activate offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount();
    await act(async () => undefined);
    expect(registration.update).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
  it("checks again after an unavailable update when the app regains focus", async () => {
    registration.waiting = null;
    registration.update.mockRejectedValueOnce(new Error("offline"));
    mount();
    await waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));
  });
  it("ignores readiness failure and unsubscribes on unmount", async () => {
    serviceWorker.ready = Promise.reject(new Error("unavailable"));
    const remove = vi.spyOn(serviceWorker, "removeEventListener");
    const view = mount();
    await act(async () => undefined);
    view.unmount();
    expect(remove).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  });
});
