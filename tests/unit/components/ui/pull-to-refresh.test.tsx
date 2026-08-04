import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("PullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ontouchstart", { configurable: true, value: null });
  });

  it("renders its indicator before the header and page content", async () => {
    render(
      <PullToRefresh
        onRefresh={async () => {}}
        header={<header data-testid="toolbar">Toolbar</header>}
      >
        <main data-testid="content">Content</main>
      </PullToRefresh>
    );

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh-indicator")).toBeInTheDocument()
    );
    const indicator = screen.getByTestId("pull-to-refresh-indicator");
    const toolbar = screen.getByTestId("toolbar");
    const content = screen.getByTestId("content");

    expect(
      indicator.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      toolbar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("starts from the whole marked main surface and prevents only a downward pull", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <nav data-testid="navigation">Navigation</nav>
        <main data-pull-to-refresh-surface="">
          <PullToRefresh onRefresh={onRefresh}>
            <div data-testid="short-list">Short list</div>
          </PullToRefresh>
        </main>
      </>
    );

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

  it("ignores navigation and hidden pull-to-refresh roots", async () => {
    const hiddenRefresh = vi.fn().mockResolvedValue(undefined);
    const visibleRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <nav data-testid="navigation">Navigation</nav>
        <main data-pull-to-refresh-surface="">
          <div aria-hidden="true">
            <PullToRefresh onRefresh={hiddenRefresh}>
              <div>Hidden view</div>
            </PullToRefresh>
          </div>
          <PullToRefresh onRefresh={visibleRefresh}>
            <div>Visible view</div>
          </PullToRefresh>
        </main>
      </>
    );

    const navigation = screen.getByTestId("navigation");
    act(() => {
      dispatchTouch(navigation, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(navigation, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(navigation, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(hiddenRefresh).not.toHaveBeenCalled();
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
    expect(hiddenRefresh).not.toHaveBeenCalled();

    const hiddenView = screen.getByText("Hidden view");
    act(() => {
      dispatchTouch(hiddenView, "touchstart", [{ clientX: 0, clientY: 0 }]);
      dispatchTouch(hiddenView, "touchmove", [{ clientX: 0, clientY: 140 }]);
      dispatchTouch(hiddenView, "touchend", [], [{ clientX: 0, clientY: 140 }]);
    });
    expect(hiddenRefresh).not.toHaveBeenCalled();
  });

  it("resets the pull distance when the browser cancels the gesture", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <main data-pull-to-refresh-surface="">
        <PullToRefresh onRefresh={onRefresh}>
          <div>Content</div>
        </PullToRefresh>
      </main>
    );

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

  it("does not intercept an upward or horizontal gesture", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <main data-pull-to-refresh-surface="">
        <PullToRefresh onRefresh={onRefresh}>
          <div>Content</div>
        </PullToRefresh>
      </main>
    );

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
