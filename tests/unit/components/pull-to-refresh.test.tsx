import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import messagesZh from "messages/zh.json";

const ptrMessages = (messagesZh.PullToRefresh ?? {}) as {
  pullToRefresh: string;
  releaseToRefresh: string;
  refreshing: string;
};

const TEST_THRESHOLD = 60;
const TOUCH_START_Y = 50;
const PULL_DISTANCE_BEFORE_THRESHOLD = TEST_THRESHOLD - 20;
const PULL_DISTANCE_AFTER_THRESHOLD = TEST_THRESHOLD + 10;
const TOUCH_MOVE_DAMPING = 0.5;
const PULL_HINT_MOVE_Y = TOUCH_START_Y + PULL_DISTANCE_BEFORE_THRESHOLD / TOUCH_MOVE_DAMPING;
const RELEASE_HINT_MOVE_Y = TOUCH_START_Y + PULL_DISTANCE_AFTER_THRESHOLD / TOUCH_MOVE_DAMPING;

const createTouchHarness = (root: HTMLDivElement) => {
  let gestureActive = false;
  let dropNextTouchEnd = false;

  const originalAddEventListener = root.addEventListener;
  const originalDispatchEvent = root.dispatchEvent;

  // Simulate iOS Safari missing the current `touchend` when the listener is attached mid-gesture.
  const hookAdd: typeof root.addEventListener = function (
    this: HTMLDivElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === "touchend" && gestureActive) {
      dropNextTouchEnd = true;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  const hookDispatch: typeof root.dispatchEvent = function (this: HTMLDivElement, event) {
    if (event.type === "touchend" && dropNextTouchEnd) {
      dropNextTouchEnd = false;
      return true;
    }
    return originalDispatchEvent.call(this, event);
  };

  root.addEventListener = hookAdd;
  root.dispatchEvent = hookDispatch;

  const fireTouchEvent = (type: "touchstart" | "touchmove" | "touchend", clientY: number) => {
    const touchInit: TouchInit = {
      identifier: 0,
      target: root,
      clientX: 0,
      clientY,
      pageX: 0,
      pageY: clientY,
      screenX: 0,
      screenY: clientY,
    };

    const touch = typeof Touch === "function" ? new Touch(touchInit) : (touchInit as Touch);
    const event = new window.TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === "touchend" ? [] : [touch],
      targetTouches: type === "touchend" ? [] : [touch],
      changedTouches: [touch],
    });

    if (type === "touchstart") {
      gestureActive = true;
      dropNextTouchEnd = false;
    }

    if (type === "touchend") {
      gestureActive = false;
    }

    root.dispatchEvent(event);
  };

  const cleanup = () => {
    root.addEventListener = originalAddEventListener;
    root.dispatchEvent = originalDispatchEvent;
  };

  return { fireTouchEvent, cleanup };
};

let originalOntouchstart: typeof window.ontouchstart;

describe("PullToRefresh regression", () => {
  beforeEach(() => {
    originalOntouchstart = window.ontouchstart;
    // Presence of window.ontouchstart lets PullToRefresh treat the environment as touch-capable.
    window.ontouchstart = vi.fn();
  });

  afterEach(() => {
    window.ontouchstart = originalOntouchstart;
  });

  it("calls onRefresh even when onRefresh reference changes during an active touch gesture", async () => {
    const refreshV1 = vi.fn(() => Promise.resolve());
    const refreshV2 = vi.fn(() => Promise.resolve());

    const Parent = () => {
      const [handler, setHandler] = useState(() => refreshV1);
      return (
        <>
          <PullToRefresh onRefresh={handler} className="ptr-root" threshold={TEST_THRESHOLD}>
            <div data-testid="body">body</div>
          </PullToRefresh>
          <button type="button" onClick={() => setHandler(() => refreshV2)}>
            Swap handler
          </button>
        </>
      );
    };

    const { container, getByRole } = render(<Parent />);
    const ptrRoot = container.querySelector<HTMLDivElement>(".ptr-root");
    expect(ptrRoot).toBeInstanceOf(HTMLDivElement);
    if (!(ptrRoot instanceof HTMLDivElement)) {
      throw new Error("Expected .ptr-root to render as an HTMLDivElement");
    }
    const swapButton = getByRole("button", { name: /swap handler/i });
    const harness = createTouchHarness(ptrRoot);

    try {
      await act(async () => {
        harness.fireTouchEvent("touchstart", TOUCH_START_Y);
        harness.fireTouchEvent("touchmove", PULL_HINT_MOVE_Y);
      });

      expect(container.textContent).toContain(ptrMessages.pullToRefresh);

      await act(async () => {
        fireEvent.click(swapButton);
      });

      await act(async () => {
        harness.fireTouchEvent("touchmove", RELEASE_HINT_MOVE_Y);
      });

      expect(container.textContent).toContain(ptrMessages.releaseToRefresh);

      await act(async () => {
        harness.fireTouchEvent("touchend", RELEASE_HINT_MOVE_Y);
      });
    } finally {
      harness.cleanup();
    }

    const totalCalls = refreshV1.mock.calls.length + refreshV2.mock.calls.length;
    expect(refreshV1).not.toHaveBeenCalled();
    expect(refreshV2).toHaveBeenCalled();
    expect(totalCalls).toBeGreaterThan(0);
  });

  it("keeps showing refreshing state until refresh promise resolves", async () => {
    let resolveRefresh: (() => void) | undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    const { container, queryByText } = render(
      <PullToRefresh onRefresh={onRefresh} className="ptr-root" threshold={TEST_THRESHOLD}>
        <div data-testid="body">body</div>
      </PullToRefresh>
    );

    const ptrRoot = container.querySelector<HTMLDivElement>(".ptr-root");
    expect(ptrRoot).toBeInstanceOf(HTMLDivElement);
    if (!(ptrRoot instanceof HTMLDivElement)) {
      throw new Error("Expected .ptr-root to render as an HTMLDivElement");
    }

    const harness = createTouchHarness(ptrRoot);

    try {
      await act(async () => {
        harness.fireTouchEvent("touchstart", TOUCH_START_Y);
        harness.fireTouchEvent("touchmove", RELEASE_HINT_MOVE_Y);
        harness.fireTouchEvent("touchend", RELEASE_HINT_MOVE_Y);
      });

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalledTimes(1);
      });

      expect(queryByText(ptrMessages.refreshing)).not.toBeNull();

      resolveRefresh?.();

      await waitFor(() => {
        expect(queryByText(ptrMessages.refreshing)).toBeNull();
      });
    } finally {
      harness.cleanup();
    }
  });
});
