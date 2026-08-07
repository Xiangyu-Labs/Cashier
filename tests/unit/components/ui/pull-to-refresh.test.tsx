import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefreshSurface } from "@/components/ui/pull-to-refresh";
import {
  PullToRefreshProvider,
  useRegisterExternalLoadingActivity,
  useRegisterPullToRefresh,
} from "@/modules/workspace/pull-to-refresh-context";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function RefreshTarget({
  onRefresh,
  enabled = true,
  children,
}: {
  onRefresh: () => Promise<void>;
  enabled?: boolean;
  children?: React.ReactNode;
}) {
  useRegisterPullToRefresh(onRefresh, enabled);
  return <div data-testid="target">{children}</div>;
}

function ExternalLoading({ active = true }: { active?: boolean }) {
  useRegisterExternalLoadingActivity(active);
  return null;
}

function renderShell(children: React.ReactNode) {
  return render(
    <PullToRefreshProvider>
      <main data-pull-to-refresh-surface="">
        <PullToRefreshSurface>{children}</PullToRefreshSurface>
      </main>
    </PullToRefreshProvider>
  );
}

describe("PullToRefreshSurface", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ontouchstart", { configurable: true, value: null });
  });

  it("renders the indicator above the page content", async () => {
    renderShell(<RefreshTarget onRefresh={async () => {}}>Content</RefreshTarget>);

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh-indicator")).toBeInTheDocument()
    );
    const indicator = screen.getByTestId("pull-to-refresh-indicator");
    const content = screen.getByText("Content");

    expect(
      indicator.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("automatically shows external loading and blocks a duplicate pull", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(
      <>
        <ExternalLoading />
        <RefreshTarget onRefresh={onRefresh}>Content</RefreshTarget>
      </>
    );

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh-indicator")).toHaveStyle({ height: "44px" })
    );
    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;
    act(() => {
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(surface, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("keeps external loading active while registered sources hand off", async () => {
    const { rerender } = renderShell(
      <>
        <ExternalLoading />
        <ExternalLoading />
      </>
    );
    const indicator = screen.getByTestId("pull-to-refresh-indicator");
    await waitFor(() => expect(indicator).toHaveStyle({ height: "44px" }));

    rerender(
      <PullToRefreshProvider>
        <main data-pull-to-refresh-surface="">
          <PullToRefreshSurface>
            <ExternalLoading />
          </PullToRefreshSurface>
        </main>
      </PullToRefreshProvider>
    );
    expect(indicator).toHaveStyle({ height: "44px" });

    rerender(
      <PullToRefreshProvider>
        <main data-pull-to-refresh-surface="">
          <PullToRefreshSurface>{null}</PullToRefreshSurface>
        </main>
      </PullToRefreshProvider>
    );
    await waitFor(() => expect(indicator).toHaveStyle({ height: "0px" }));
  });

  it("starts from the whole marked main surface and triggers the registered callback", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(<RefreshTarget onRefresh={onRefresh}>Short list</RefreshTarget>);

    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;

    let move: Event | undefined;
    act(() => {
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
      move = dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(surface, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(move?.defaultPrevented).toBe(true);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("ignores nav and inputs", async () => {
    const visibleRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(
      <>
        <nav data-testid="navigation">Navigation</nav>
        <RefreshTarget onRefresh={visibleRefresh}>
          <input data-testid="blocked-input" />
        </RefreshTarget>
      </>
    );

    const navigation = screen.getByTestId("navigation");
    act(() => {
      dispatchTouch(navigation, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(navigation, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(navigation, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(visibleRefresh).not.toHaveBeenCalled();

    const input = screen.getByTestId("blocked-input");
    act(() => {
      dispatchTouch(input, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(input, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(input, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(visibleRefresh).not.toHaveBeenCalled();

    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;
    act(() => {
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(surface, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });

    await waitFor(() => expect(visibleRefresh).toHaveBeenCalledTimes(1));
  });

  it("allows pulls that start on a button", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(
      <RefreshTarget onRefresh={onRefresh}>
        <button data-testid="allowed-button">Button</button>
      </RefreshTarget>
    );
    const button = screen.getByTestId("allowed-button");
    act(() => {
      dispatchTouch(button, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(button, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(button, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("resets the pull distance when the browser cancels the gesture", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(<RefreshTarget onRefresh={onRefresh}>Content</RefreshTarget>);

    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;
    dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
    act(() => {
      dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 140 }]);
    });
    expect(screen.getByTestId("pull-to-refresh-indicator")).toHaveStyle({ height: "70px" });

    act(() => {
      dispatchTouch(surface, "touchcancel", [], []);
    });
    expect(screen.getByTestId("pull-to-refresh-indicator")).toHaveStyle({ height: "0px" });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not intercept an upward or horizontal gesture", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderShell(<RefreshTarget onRefresh={onRefresh}>Content</RefreshTarget>);

    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;

    let upward: Event | undefined;
    let horizontal: Event | undefined;
    act(() => {
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 100 }]);
      upward = dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 90 }]);
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
      horizontal = dispatchTouch(surface, "touchmove", [{ clientX: 40, clientY: 20 }]);
    });
    expect(upward?.defaultPrevented).toBe(false);
    expect(horizontal?.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("only calls the currently registered callback after unmount/switch", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderShell(<RefreshTarget onRefresh={first} />);

    rerender(
      <PullToRefreshProvider>
        <main data-pull-to-refresh-surface="">
          <PullToRefreshSurface>
            <RefreshTarget onRefresh={second} />
          </PullToRefreshSurface>
        </main>
      </PullToRefreshProvider>
    );

    const surface = document.querySelector("main");
    expect(surface).not.toBeNull();
    if (surface == null) return;
    act(() => {
      dispatchTouch(surface, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(surface, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(surface, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });

    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });
});

function dispatchTouch(
  target: EventTarget,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches = touches
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: type === "touchmove",
  });
  Object.defineProperty(event, "touches", { configurable: true, value: touches });
  Object.defineProperty(event, "changedTouches", {
    configurable: true,
    value: changedTouches,
  });
  target.dispatchEvent(event);
  return event;
}
