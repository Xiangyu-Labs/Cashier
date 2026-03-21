import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import messagesZh from 'messages/zh.json';

const ptrMessages = (messagesZh.PullToRefresh ?? {}) as {
  pullToRefresh: string;
  releaseToRefresh: string;
};

const createTouchHarness = (root: HTMLDivElement) => {
  let gestureActive = false;
  let dropNextTouchEnd = false;

  const originalAddEventListener = root.addEventListener;
  const originalDispatchEvent = root.dispatchEvent;

  const hookAdd: typeof root.addEventListener = function (this: HTMLDivElement, type, listener, options) {
    if (type === 'touchend' && gestureActive) {
      dropNextTouchEnd = true;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  const hookDispatch: typeof root.dispatchEvent = function (this: HTMLDivElement, event) {
    if (event.type === 'touchend' && dropNextTouchEnd) {
      dropNextTouchEnd = false;
      return true;
    }
    return originalDispatchEvent.call(this, event);
  };

  root.addEventListener = hookAdd;
  root.dispatchEvent = hookDispatch;

  const fireTouchEvent = (type: 'touchstart' | 'touchmove' | 'touchend', clientY: number) => {
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

    const touch = typeof Touch === 'function' ? new Touch(touchInit) : (touchInit as Touch);
    const event = new window.TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === 'touchend' ? [] : [touch],
      targetTouches: type === 'touchend' ? [] : [touch],
      changedTouches: [touch],
    });

    if (type === 'touchstart') {
      gestureActive = true;
      dropNextTouchEnd = false;
    }

    if (type === 'touchend') {
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

describe('PullToRefresh regression', () => {
  beforeEach(() => {
    originalOntouchstart = window.ontouchstart;
    // Presence of window.ontouchstart lets PullToRefresh treat the environment as touch-capable.
    window.ontouchstart = vi.fn();
  });

  afterEach(() => {
    window.ontouchstart = originalOntouchstart;
  });

  it('calls onRefresh even when onRefresh reference changes during touchmove', async () => {
    const refreshV1 = vi.fn(() => Promise.resolve());
    const refreshV2 = vi.fn(() => Promise.resolve());

    const Parent = () => {
      const [handler, setHandler] = useState(() => refreshV1);
      return (
        <>
          <PullToRefresh onRefresh={handler} className="ptr-root">
            <div data-testid="body">body</div>
          </PullToRefresh>
          <button type="button" onClick={() => setHandler(() => refreshV2)}>
            Swap handler
          </button>
        </>
      );
    };

    const { container, getByRole } = render(<Parent />);
    const ptr = container.querySelector('.ptr-root');
    expect(ptr).not.toBeNull();
    const ptrDiv = ptr as HTMLDivElement;
    const swapButton = getByRole('button', { name: /swap handler/i });
    const harness = createTouchHarness(ptrDiv);

    try {
      await act(async () => {
        harness.fireTouchEvent('touchstart', 50);
        harness.fireTouchEvent('touchmove', 100);
      });

      expect(container.textContent).toContain(ptrMessages.pullToRefresh);

      await act(async () => {
        fireEvent.click(swapButton);
      });

      await act(async () => {
        harness.fireTouchEvent('touchmove', 250);
      });

      expect(container.textContent).toContain(ptrMessages.releaseToRefresh);

      await act(async () => {
        harness.fireTouchEvent('touchend', 250);
      });
    } finally {
      harness.cleanup();
    }

    const totalCalls = refreshV1.mock.calls.length + refreshV2.mock.calls.length;
    expect(refreshV1).not.toHaveBeenCalled();
    expect(refreshV2).toHaveBeenCalled();
    expect(totalCalls).toBeGreaterThan(0);
  });
});
