import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

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

  target.dispatchEvent(event);
};

describe('PullToRefresh regression', () => {
  beforeEach(() => {
    window.ontouchstart = vi.fn();
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
      fireTouchEvent(ptr, 'touchstart', 0);
      fireTouchEvent(ptr, 'touchmove', 10);
    });

    await act(async () => {
      fireEvent.click(swapButton);
    });

    await act(async () => {
      fireTouchEvent(ptr, 'touchmove', 100);
      fireTouchEvent(ptr, 'touchend', 100);
    });

    const totalCalls = refreshV1.mock.calls.length + refreshV2.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);
  });
});
