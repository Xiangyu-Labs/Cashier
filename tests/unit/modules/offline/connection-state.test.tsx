// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
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

describe("connection state", () => {
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
