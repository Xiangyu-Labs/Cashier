import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "@/hooks/use-countdown";

describe("useCountdown", () => {
  afterEach(() => vi.useRealTimers());

  it("notifies for an initially expired target and again for a new target", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    const onExpired = vi.fn();
    const { rerender } = renderHook(({ targetTime }) => useCountdown({ targetTime, onExpired }), {
      initialProps: { targetTime: 999 },
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    rerender({ targetTime: 1002 });
    act(() => vi.advanceTimersByTime(3_000));
    expect(onExpired).toHaveBeenCalledTimes(2);
  });
});
