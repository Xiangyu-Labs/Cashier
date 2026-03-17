import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCountdown } from "@/hooks/use-countdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应该正确计算剩余时间", () => {
    const targetTime = Math.floor(Date.now() / 1000) + 60; // 60秒后

    const { result } = renderHook(() => useCountdown({ targetTime }));

    expect(result.current.remaining).toBeLessThanOrEqual(60);
    expect(result.current.remaining).toBeGreaterThan(55);
    expect(result.current.isExpired).toBe(false);
  });

  it("应该每秒递减剩余时间", async () => {
    const targetTime = Math.floor(Date.now() / 1000) + 10;

    const { result } = renderHook(() => useCountdown({ targetTime }));

    const initialRemaining = result.current.remaining;

    // 前进1秒
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.remaining).toBe(initialRemaining - 1);
  });

  it("应该在倒计时结束时调用onExpired回调", async () => {
    const onExpired = vi.fn();
    const targetTime = Math.floor(Date.now() / 1000) + 3;

    renderHook(() => useCountdown({ targetTime, onExpired }));

    // 前进3秒
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("当targetTime为null时应该返回0", () => {
    const { result } = renderHook(() => useCountdown({ targetTime: null }));

    expect(result.current.remaining).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it("多个实例应该共享同一个timer store", () => {
    const targetTime1 = Math.floor(Date.now() / 1000) + 10;
    const targetTime2 = Math.floor(Date.now() / 1000) + 20;

    const { result: result1 } = renderHook(() => useCountdown({ targetTime: targetTime1 }));
    const { result: result2 } = renderHook(() => useCountdown({ targetTime: targetTime2 }));

    const remaining1Before = result1.current.remaining;
    const remaining2Before = result2.current.remaining;

    // 前进2秒
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result1.current.remaining).toBe(remaining1Before - 2);
    expect(result2.current.remaining).toBe(remaining2Before - 2);
  });
});
