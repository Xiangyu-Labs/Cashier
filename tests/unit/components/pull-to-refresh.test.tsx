import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

let gestureActive = false;
let dropNextTouchEnd = false;

const fireTouchEvent = (target: HTMLElement, type: string, clientY: number) => {
  const touchInit: TouchInit = {
    identifier: 0,
    target,
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
    touches: [touch],
    targetTouches: [touch],
    changedTouches: [touch],
  });

  if (type === 'touchstart') {
    gestureActive = true;
    dropNextTouchEnd = false;
  }

  if (type === 'touchend') {
    gestureActive = false;
  }

  target.dispatchEvent(event);
};

let originalOntouchstart: typeof window.ontouchstart;
let originalAddEventListener: typeof EventTarget.prototype.addEventListener;
let originalDispatchEvent: typeof EventTarget.prototype.dispatchEvent;

describe('PullToRefresh regression', () => {
  beforeEach(() => {
    originalOntouchstart = window.ontouchstart;
    window.ontouchstart = vi.fn();

    originalAddEventListener = EventTarget.prototype.addEventListener;
    originalDispatchEvent = EventTarget.prototype.dispatchEvent;

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === 'touchend' && gestureActive) {
        dropNextTouchEnd = true;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    EventTarget.prototype.dispatchEvent = function (event) {
      if (event.type === 'touchend' && dropNextTouchEnd) {
        dropNextTouchEnd = false;
        return true;
      }
      return originalDispatchEvent.call(this, event);
    };
  });

  afterEach(() => {
    window.ontouchstart = originalOntouchstart;
    EventTarget.prototype.addEventListener = originalAddEventListener;
    EventTarget.prototype.dispatchEvent = originalDispatchEvent;
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
    const ptr = container.querySelector('.ptr-root') as HTMLElement;
    const swapButton = getByRole('button', { name: /swap handler/i });

    await act(async () => {
      fireTouchEvent(ptr, 'touchstart', 50);
      fireTouchEvent(ptr, 'touchmove', 100);
    });

    await act(async () => {
      fireEvent.click(swapButton);
    });

    await act(async () => {
      fireTouchEvent(ptr, 'touchmove', 250);
      fireTouchEvent(ptr, 'touchend', 250);
    });

    const totalCalls = refreshV1.mock.calls.length + refreshV2.mock.calls.length;
    expect(refreshV1).not.toHaveBeenCalled();
    expect(refreshV2).toHaveBeenCalled();
    expect(totalCalls).toBeGreaterThan(0);
  });
});
