import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

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

describe("useSmartPolling", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should fetch data immediately on mount", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ active: true, count: 1 });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        const { result } = renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["test"],
                    queryFn: fetchFn,
                    isActive,
                }),
            { wrapper: createWrapper() }
        );

        // Wait for initial fetch
        await waitFor(() => expect(result.current.data).toEqual({ active: true, count: 1 }));
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("should poll when data is active", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ active: true });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["active-test"],
                    queryFn: fetchFn,
                    isActive,
                    interval: 1000,
                }),
            { wrapper: createWrapper() }
        );

        // Initial fetch
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Advance by base interval
        vi.advanceTimersByTime(1000);
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    });

    it("should stop polling when isActive returns false", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ active: false });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["inactive-test"],
                    queryFn: fetchFn,
                    isActive,
                    interval: 1000,
                }),
            { wrapper: createWrapper() }
        );

        // Initial fetch
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Should not poll further since isActive returns false
        vi.advanceTimersByTime(2000);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("should use idleInterval when provided and inactive", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ active: false });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["idle-test"],
                    queryFn: fetchFn,
                    isActive,
                    interval: 1000,
                    idleInterval: 5000,
                }),
            { wrapper: createWrapper() }
        );

        // Initial fetch
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Should use idleInterval for background checks
        vi.advanceTimersByTime(5000);
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    });

    it("should use default interval when not specified", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ active: true });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["default-test"],
                    queryFn: fetchFn,
                    isActive,
                }),
            { wrapper: createWrapper() }
        );

        // Initial fetch
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Default interval is 3000ms
        vi.advanceTimersByTime(3000);
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    });

    it("should pass through query options", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
        const isActive = () => false;

        const { result } = renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["options-test"],
                    queryFn: fetchFn,
                    isActive,
                    enabled: true,
                    staleTime: 5000,
                }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.data).toEqual({ data: "test" }));
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("should handle query errors gracefully", async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
        const isActive = () => true;

        const { result } = renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["error-test"],
                    queryFn: fetchFn,
                    isActive,
                    retry: false,
                }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.error).toBeDefined());
        expect(result.current.error?.message).toBe("Network error");
    });

    it("should track data changes for cooldown logic", async () => {
        let callCount = 0;
        const fetchFn = vi.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve({ active: true, value: callCount });
        });
        const isActive = (data: { active: boolean } | undefined) => data?.active ?? false;

        renderHook(
            () =>
                useSmartPolling({
                    queryKey: ["change-track-test"],
                    queryFn: fetchFn,
                    isActive,
                    interval: 1000,
                }),
            { wrapper: createWrapper() }
        );

        // Initial fetch
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Next poll with different data
        vi.advanceTimersByTime(1000);
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    });
});
