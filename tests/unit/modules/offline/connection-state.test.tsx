// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStateProvider, useConnectionState } from "@/modules/offline/connection-state";

function Status() {
  const { networkStatus, retryInSeconds, retry } = useConnectionState();
  return (
    <div>
      <div data-testid="status">{networkStatus}</div>
      <div data-testid="retry">{retryInSeconds ?? "none"}</div>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderProvider() {
  return render(
    <ConnectionStateProvider>
      <Status />
    </ConnectionStateProvider>
  );
}

function mockOnline(value = true) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("connection state", () => {
  it("hydrates without a mismatch when the client starts offline", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: undefined,
    });
    const serverHtml = renderToString(
      <ConnectionStateProvider>
        <Status />
      </ConnectionStateProvider>
    );
    if (navigatorDescriptor != null) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    }

    mockOnline(false);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const recoverableErrors: unknown[] = [];
    const root = hydrateRoot(
      container,
      <ConnectionStateProvider>
        <Status />
      </ConnectionStateProvider>,
      { onRecoverableError: (error) => recoverableErrors.push(error) }
    );

    await act(async () => Promise.resolve());

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('[data-testid="status"]')).toHaveTextContent("offline");
    act(() => root.unmount());
    container.remove();
  });

  it("makes an offline event immediate and ignores the stale successful probe", async () => {
    let resolveProbe: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveProbe = resolve;
          })
      )
    );
    renderProvider();

    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
    await act(async () => resolveProbe?.(new Response(null, { status: 200 })));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
  });

  it("aborts an in-flight probe when the provider unmounts", () => {
    mockOnline();
    let probeSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        probeSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      })
    );

    const { unmount } = renderProvider();
    expect(probeSignal?.aborted).toBe(false);

    unmount();
    expect(probeSignal?.aborted).toBe(true);
  });

  it("keeps online content available while confirming the first failed probe", async () => {
    vi.useFakeTimers();
    mockOnline();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unreachable")));

    renderProvider();
    await act(async () => Promise.resolve());

    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
    expect(screen.getByTestId("retry")).toHaveTextContent("5");
  });

  it("returns online when the confirmation probe succeeds", async () => {
    vi.useFakeTimers();
    mockOnline();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
    );

    renderProvider();
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("status")).toHaveTextContent("checking");

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("status")).toHaveTextContent("online");
    expect(screen.getByTestId("retry")).toHaveTextContent("none");
  });

  it("uses 5 and 10 second backoff after confirmed offline failures", async () => {
    vi.useFakeTimers();
    mockOnline();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unreachable")));

    renderProvider();
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("5");

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
    expect(screen.getByTestId("retry")).toHaveTextContent("10");
  });

  it("caps automatic backoff at 30 seconds", async () => {
    vi.useFakeTimers();
    mockOnline();
    const fetchMock = vi.fn().mockRejectedValue(new Error("unreachable"));
    vi.stubGlobal("fetch", fetchMock);

    renderProvider();
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("5");

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("10");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("20");
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("30");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("30");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("preserves the current deadline across repeated offline, focus, and visibility events", async () => {
    vi.useFakeTimers();
    mockOnline();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unreachable")));

    renderProvider();
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("10");

    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => setVisibility("hidden"));
    expect(screen.getByTestId("retry")).toHaveTextContent("10");

    act(() => setVisibility("visible"));
    expect(screen.getByTestId("retry")).toHaveTextContent("10");
  });

  it("keeps a background deadline and probes immediately when it is overdue on resume", async () => {
    vi.useFakeTimers();
    mockOnline();
    const fetchMock = vi.fn().mockRejectedValue(new Error("unreachable"));
    vi.stubGlobal("fetch", fetchMock);

    renderProvider();
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("retry")).toHaveTextContent("5");

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(6_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("retry")).toHaveTextContent("10");
  });

  it("recovers immediately after a successful manual retry", async () => {
    vi.useFakeTimers();
    mockOnline();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial"))
      .mockRejectedValueOnce(new Error("confirmed"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderProvider();
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(screen.getByTestId("status")).toHaveTextContent("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("probes again on focus and online events", async () => {
    mockOnline();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderProvider();
    await act(async () => Promise.resolve());

    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => window.dispatchEvent(new Event("online")));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("status")).toHaveTextContent("online");
  });
});
