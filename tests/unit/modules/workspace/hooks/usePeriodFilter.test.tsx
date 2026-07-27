import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeriodFilter } from "@/modules/workspace/hooks/usePeriodFilter";

describe("usePeriodFilter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createSearchParams(init?: string): URLSearchParams {
    return new URLSearchParams(init ?? "");
  }

  it("reads statuses from search params", () => {
    const searchParams = createSearchParams("statuses=processing,failed");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: "/ledger/test",
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.statuses).toEqual(["processing", "failed"]);
  });

  it("returns empty statuses when no statuses param is present", () => {
    const searchParams = createSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: "/ledger/test",
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.statuses).toEqual([]);
  });

  it("includes statuses in filters built from URL state", () => {
    const searchParams = createSearchParams("statuses=anomaly,failed");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: "/ledger/test",
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.filters.statuses).toEqual(["anomaly", "failed"]);
  });

  describe("applyStreamStatusPreset", () => {
    it("applies needs_attention preset: clears period/date/amount, sets statuses, switches to stream", () => {
      const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
      const searchParams = createSearchParams("period=thisMonth&minAmount=10");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: "/ledger/test",
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      act(() => {
        result.current.applyStreamStatusPreset("needs_attention");
      });

      expect(replaceState).toHaveBeenCalledTimes(1);
      const urlStr = replaceState.mock.calls[0]![2] as string;
      const url = new URL(urlStr, "http://localhost");
      const params = url.searchParams;

      expect(params.get("streamPeriod")).toBe("all");
      expect(params.get("streamStartDate")).toBeNull();
      expect(params.get("streamEndDate")).toBeNull();
      expect(params.get("streamMinAmount")).toBeNull();
      expect(params.get("streamMaxAmount")).toBeNull();
      expect(params.get("tab")).toBe("stream");
      // Canonical order: anomaly, failed, candidate_pending
      expect(params.get("streamStatuses")).toBe("anomaly,failed,candidate_pending");
    });

    it("applies in_progress preset: clears period/date/amount, sets statuses, switches to stream", () => {
      const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
      const searchParams = createSearchParams(
        "period=custom&startDate=2024-01-01&endDate=2024-01-31&maxAmount=500"
      );
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: "/ledger/test",
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      act(() => {
        result.current.applyStreamStatusPreset("in_progress");
      });

      const urlStr = replaceState.mock.calls[0]![2] as string;
      const url = new URL(urlStr, "http://localhost");
      const params = url.searchParams;

      expect(params.get("streamPeriod")).toBe("all");
      expect(params.get("streamStartDate")).toBeNull();
      expect(params.get("streamEndDate")).toBeNull();
      expect(params.get("streamMinAmount")).toBeNull();
      expect(params.get("streamMaxAmount")).toBeNull();
      expect(params.get("tab")).toBe("stream");
      expect(params.get("streamStatuses")).toBe("processing");
    });

    it("replaces existing statuses with preset statuses", () => {
      const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
      const searchParams = createSearchParams("statuses=completed");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: "/ledger/test",
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      act(() => {
        result.current.applyStreamStatusPreset("in_progress");
      });

      const urlStr = replaceState.mock.calls[0]![2] as string;
      const url = new URL(urlStr, "http://localhost");
      const params = url.searchParams;

      expect(params.get("streamStatuses")).toBe("processing");
    });
  });
});
