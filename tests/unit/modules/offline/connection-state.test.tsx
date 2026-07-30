// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStateProvider, useConnectionState } from "@/modules/offline/connection-state";

function Status() {
  const { networkStatus } = useConnectionState();
  return <div data-testid="status">{networkStatus}</div>;
}

afterEach(() => vi.restoreAllMocks());

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
    render(
      <ConnectionStateProvider>
        <Status />
      </ConnectionStateProvider>
    );

    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
    await act(async () => resolveProbe?.(new Response(null, { status: 200 })));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
  });
});
