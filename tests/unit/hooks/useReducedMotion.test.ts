import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("useReducedMotion", () => {
    let matchMediaMock: ReturnType<typeof vi.fn>;
    let addEventListenerMock: ReturnType<typeof vi.fn>;
    let removeEventListenerMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        addEventListenerMock = vi.fn();
        removeEventListenerMock = vi.fn();

        matchMediaMock = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: addEventListenerMock,
            removeEventListener: removeEventListenerMock,
        });

        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: matchMediaMock,
        });

        Object.defineProperty(window, "innerWidth", {
            writable: true,
            value: 1024,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return false by default on desktop", () => {
        const { result } = renderHook(() => useReducedMotion());
        expect(result.current).toBe(false);
    });

    it("should return true when prefers-reduced-motion is enabled", () => {
        matchMediaMock.mockReturnValue({
            matches: true,
            addEventListener: addEventListenerMock,
            removeEventListener: removeEventListenerMock,
        });

        const { result } = renderHook(() => useReducedMotion());
        expect(result.current).toBe(true);
    });

    it("should return true on mobile devices (width < 768)", () => {
        Object.defineProperty(window, "innerWidth", {
            writable: true,
            value: 375,
        });

        const { result } = renderHook(() => useReducedMotion());
        expect(result.current).toBe(true);
    });

    it("should add event listeners on mount", () => {
        renderHook(() => useReducedMotion());

        expect(addEventListenerMock).toHaveBeenCalledWith(
            "change",
            expect.any(Function)
        );
    });

    it("should remove event listeners on unmount", () => {
        const { unmount } = renderHook(() => useReducedMotion());

        unmount();

        expect(removeEventListenerMock).toHaveBeenCalledWith(
            "change",
            expect.any(Function)
        );
    });

});
