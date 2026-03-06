import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

describe("useInfiniteScroll", () => {
    const mockFetchNextPage = vi.fn();
    let observeMock: ReturnType<typeof vi.fn>;
    let disconnectMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        observeMock = vi.fn();
        disconnectMock = vi.fn();

        // Mock IntersectionObserver
        global.IntersectionObserver = vi.fn().mockImplementation(() => ({
            observe: observeMock,
            disconnect: disconnectMock,
            unobserve: vi.fn(),
            takeRecords: vi.fn(),
            root: null,
            rootMargin: "",
            thresholds: [],
        })) as unknown as typeof IntersectionObserver;

        mockFetchNextPage.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return a ref object", () => {
        const { result } = renderHook(() =>
            useInfiniteScroll({
                hasNextPage: true,
                isFetchingNextPage: false,
                fetchNextPage: mockFetchNextPage,
            })
        );

        expect(result.current).toHaveProperty("current");
        expect(result.current.current).toBeNull();
    });

    it("should not throw when rendered with valid props", () => {
        expect(() => {
            renderHook(() =>
                useInfiniteScroll({
                    hasNextPage: true,
                    isFetchingNextPage: false,
                    fetchNextPage: mockFetchNextPage,
                })
            );
        }).not.toThrow();
    });

    it("should handle hasNextPage=false", () => {
        expect(() => {
            renderHook(() =>
                useInfiniteScroll({
                    hasNextPage: false,
                    isFetchingNextPage: false,
                    fetchNextPage: mockFetchNextPage,
                })
            );
        }).not.toThrow();
    });

    it("should handle isFetchingNextPage=true", () => {
        expect(() => {
            renderHook(() =>
                useInfiniteScroll({
                    hasNextPage: true,
                    isFetchingNextPage: true,
                    fetchNextPage: mockFetchNextPage,
                })
            );
        }).not.toThrow();
    });

    it("should handle custom rootMargin", () => {
        expect(() => {
            renderHook(() =>
                useInfiniteScroll({
                    hasNextPage: true,
                    isFetchingNextPage: false,
                    fetchNextPage: mockFetchNextPage,
                    rootMargin: "100px",
                })
            );
        }).not.toThrow();
    });

    it("should not throw on unmount", () => {
        const { unmount } = renderHook(() =>
            useInfiniteScroll({
                hasNextPage: true,
                isFetchingNextPage: false,
                fetchNextPage: mockFetchNextPage,
            })
        );

        expect(() => unmount()).not.toThrow();
    });

    it("should handle rerender with changed props", () => {
        const { rerender } = renderHook(
            ({ hasNextPage, isFetchingNextPage }: { hasNextPage: boolean; isFetchingNextPage: boolean }) =>
                useInfiniteScroll({
                    hasNextPage,
                    isFetchingNextPage,
                    fetchNextPage: mockFetchNextPage,
                }),
            { initialProps: { hasNextPage: true, isFetchingNextPage: false } }
        );

        // Rerender with different props
        expect(() => {
            rerender({ hasNextPage: false, isFetchingNextPage: false });
            rerender({ hasNextPage: false, isFetchingNextPage: true });
            rerender({ hasNextPage: true, isFetchingNextPage: false });
        }).not.toThrow();
    });

    it("should accept function as fetchNextPage", () => {
        const fetchFn = vi.fn();

        expect(() => {
            renderHook(() =>
                useInfiniteScroll({
                    hasNextPage: true,
                    isFetchingNextPage: false,
                    fetchNextPage: fetchFn,
                })
            );
        }).not.toThrow();
    });
});
