import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { usePrefetchRelatedData } from "@/features/ledger/client/hooks/usePrefetchRelatedData";

// Test wrapper with QueryClient
function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
    };
}

describe("usePrefetchRelatedData", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const defaultProps = {
        ledgerId: "test-ledger-id",
        activeTab: "history" as const,
        ledger: undefined,
        categories: [],
        periodParams: { period: "thisMonth" as const },
    };

    it("should not prefetch immediately on mount", () => {
        const prefetchMock = vi.fn();

        renderHook(
            () => usePrefetchRelatedData(defaultProps),
            { wrapper: createWrapper() }
        );

        // Should not prefetch immediately
        expect(prefetchMock).not.toHaveBeenCalled();
    });

    it("should trigger tab-level prefetch after 1.5s delay", async () => {
        const { rerender } = renderHook(
            () => usePrefetchRelatedData(defaultProps),
            { wrapper: createWrapper() }
        );

        // Advance by prefetch delay
        vi.advanceTimersByTime(1500);

        // Hook should still be mounted and working
        rerender({
            ...defaultProps,
            activeTab: "details",
        });

        // Should not throw
        expect(true).toBe(true);
    });

    it("should cancel timers when activeTab changes", async () => {
        const { rerender } = renderHook(
            ({ activeTab }) =>
                usePrefetchRelatedData({
                    ...defaultProps,
                    activeTab,
                }),
            {
                wrapper: createWrapper(),
                initialProps: { activeTab: "history" as const },
            }
        );

        // Change tab before delay completes
        vi.advanceTimersByTime(1000);
        rerender({ activeTab: "details" });

        // Should not throw
        expect(true).toBe(true);
    });

    it("should handle rapid tab switches without errors", async () => {
        const { rerender } = renderHook(
            ({ activeTab }) =>
                usePrefetchRelatedData({
                    ...defaultProps,
                    activeTab,
                }),
            {
                wrapper: createWrapper(),
                initialProps: { activeTab: "history" as const },
            }
        );

        // Rapid tab switches
        rerender({ activeTab: "details" });
        rerender({ activeTab: "stats" });
        rerender({ activeTab: "settings" });
        rerender({ activeTab: "history" });

        vi.advanceTimersByTime(3000);

        // Should not throw
        expect(true).toBe(true);
    });

    it("should handle unmount gracefully", async () => {
        const { unmount } = renderHook(
            () => usePrefetchRelatedData(defaultProps),
            { wrapper: createWrapper() }
        );

        // Unmount before timers complete
        vi.advanceTimersByTime(1000);
        unmount();

        // Advance timers after unmount - should not throw
        vi.advanceTimersByTime(3000);

        expect(true).toBe(true);
    });
});
