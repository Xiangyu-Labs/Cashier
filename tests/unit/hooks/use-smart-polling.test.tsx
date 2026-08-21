import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSmartPolling } from "@/hooks/use-smart-polling";

describe("useSmartPolling", () => {
  it("polls only for an active session and stops after the bounded sequence", () => {
    const { result, rerender } = renderHook(
      ({ sessionKey, missing }) =>
        useSmartPolling<{ missing: boolean }>({
          sessionKey,
          isPollingActive: (data) => data?.missing === true && missing,
        }),
      { initialProps: { sessionKey: 0, missing: true } }
    );
    const query = (dataUpdatedAt: number) => ({
      state: { data: { missing: true }, dataUpdatedAt },
    });

    expect(result.current(query(1))).toBe(false);
    rerender({ sessionKey: 1, missing: true });
    expect(result.current(query(1))).toBe(3000);
    expect(result.current(query(1))).toBe(3000);
    expect(result.current(query(2))).toBe(30_000);
    expect(result.current(query(3))).toBe(60_000);
    expect(result.current(query(4))).toBe(60_000);
    expect(result.current(query(5))).toBe(60_000);
    expect(result.current(query(6))).toBe(false);

    rerender({ sessionKey: 2, missing: false });
    expect(result.current(query(7))).toBe(false);
  });
});
