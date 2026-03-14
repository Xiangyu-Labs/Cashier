import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCalendarHeatmap,
  useCalendarDayDetail,
  useCalendarHeatmapForRange,
} from "@/features/calendar/client/hooks/use-calendar-data";
import * as heatmapActions from "@/features/calendar/server/actions/heatmap";

// Mock server actions
vi.mock("@/features/calendar/server/actions/heatmap", () => ({
  getCalendarHeatmapData: vi.fn(),
  getCalendarDayDetail: vi.fn(),
  getCalendarHeatmapForRange: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("useCalendarData hooks", () => {
  const mockLedgerId = "test-ledger-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCalendarHeatmap", () => {
    it("should fetch heatmap data for month view", async () => {
      const mockData = {
        days: [
          { date: "2024-03-01", totalAmount: 100, entryCount: 1, currencies: ["CNY"] },
          { date: "2024-03-15", totalAmount: 200, entryCount: 2, currencies: ["CNY"] },
        ],
        range: { startDate: "2024-03-01", endDate: "2024-03-31" },
        stats: { minAmount: 100, maxAmount: 200, avgAmount: 150, p80Amount: 200 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapData).mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useCalendarHeatmap(mockLedgerId, "month", "2024-03-01"),
        { wrapper: createWrapper() }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockData);
      expect(heatmapActions.getCalendarHeatmapData).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
        filters: undefined,
      });
    });

    it("should fetch heatmap data for year view", async () => {
      const mockData = {
        days: [
          { date: "2024-01-15", totalAmount: 100, entryCount: 1, currencies: ["CNY"] },
          { date: "2024-06-15", totalAmount: 200, entryCount: 2, currencies: ["CNY"] },
        ],
        range: { startDate: "2024-01-01", endDate: "2024-12-31" },
        stats: { minAmount: 100, maxAmount: 200, avgAmount: 150, p80Amount: 200 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapData).mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useCalendarHeatmap(mockLedgerId, "year", "2024-01-01"),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(heatmapActions.getCalendarHeatmapData).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        viewType: "year",
        anchorDate: "2024-01-01",
        filters: undefined,
      });
    });

    it("should apply filters when provided", async () => {
      const mockData = {
        days: [],
        range: { startDate: "2024-03-01", endDate: "2024-03-31" },
        stats: { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapData).mockResolvedValue(mockData);

      const filters = { currency: "CNY", categoryId: "test-category" };

      const { result } = renderHook(
        () => useCalendarHeatmap(mockLedgerId, "month", "2024-03-01", filters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(heatmapActions.getCalendarHeatmapData).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
        filters,
      });
    });

    it("should use placeholder data for smooth transitions", async () => {
      const initialData = {
        days: [{ date: "2024-02-01", totalAmount: 100, entryCount: 1, currencies: ["CNY"] }],
        range: { startDate: "2024-02-01", endDate: "2024-02-29" },
        stats: { minAmount: 100, maxAmount: 100, avgAmount: 100, p80Amount: 100 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapData).mockResolvedValue(initialData);

      const { result, rerender } = renderHook(
        ({ anchorDate }: { anchorDate: string }) =>
          useCalendarHeatmap(mockLedgerId, "month", anchorDate),
        {
          wrapper: createWrapper(),
          initialProps: { anchorDate: "2024-02-01" },
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Change to March - should keep February data as placeholder initially
      rerender({ anchorDate: "2024-03-01" });

      // Should show placeholder data while fetching new data
      expect(result.current.isPlaceholderData).toBe(true);
      expect(result.current.data).toEqual(initialData);
    });
  });

  describe("useCalendarDayDetail", () => {
    it("should fetch day detail when date is provided", async () => {
      const mockData = {
        date: "2024-03-15",
        entries: [
          {
            id: "entry-1",
            itemName: "Lunch",
            amount: 50,
            currency: "CNY",
            categoryName: "餐饮",
          },
        ],
        totalAmount: 50,
        totalCount: 1,
      };

      vi.mocked(heatmapActions.getCalendarDayDetail).mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useCalendarDayDetail(mockLedgerId, "2024-03-15"),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockData);
      expect(heatmapActions.getCalendarDayDetail).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        date: "2024-03-15",
        filters: undefined,
      });
    });

    it("should not fetch when date is null", () => {
      const { result } = renderHook(
        () => useCalendarDayDetail(mockLedgerId, null),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(heatmapActions.getCalendarDayDetail).not.toHaveBeenCalled();
    });

    it("should apply filters when provided", async () => {
      const mockData = {
        date: "2024-03-15",
        entries: [],
        totalAmount: 0,
        totalCount: 0,
      };

      vi.mocked(heatmapActions.getCalendarDayDetail).mockResolvedValue(mockData);

      const filters = { currency: "USD" };

      const { result } = renderHook(
        () => useCalendarDayDetail(mockLedgerId, "2024-03-15", filters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(heatmapActions.getCalendarDayDetail).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        date: "2024-03-15",
        filters,
      });
    });
  });

  describe("useCalendarHeatmapForRange", () => {
    it("should fetch heatmap for custom date range", async () => {
      const mockData = {
        days: [
          { date: "2024-01-15", totalAmount: 100, entryCount: 1, currencies: ["CNY"] },
          { date: "2024-02-15", totalAmount: 200, entryCount: 2, currencies: ["CNY"] },
        ],
        range: { startDate: "2024-01-01", endDate: "2024-02-29" },
        stats: { minAmount: 100, maxAmount: 200, avgAmount: 150, p80Amount: 200 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapForRange).mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useCalendarHeatmapForRange(mockLedgerId, "2024-01-01", "2024-02-29"),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockData);
      expect(heatmapActions.getCalendarHeatmapForRange).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        startDate: "2024-01-01",
        endDate: "2024-02-29",
        filters: undefined,
      });
    });

    it("should apply filters for range query", async () => {
      const mockData = {
        days: [],
        range: { startDate: "2024-01-01", endDate: "2024-03-31" },
        stats: { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapForRange).mockResolvedValue(mockData);

      const filters = { categoryId: "test-cat" };

      const { result } = renderHook(
        () => useCalendarHeatmapForRange(mockLedgerId, "2024-01-01", "2024-03-31", filters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(heatmapActions.getCalendarHeatmapForRange).toHaveBeenCalledWith({
        ledgerId: mockLedgerId,
        startDate: "2024-01-01",
        endDate: "2024-03-31",
        filters,
      });
    });

    it("should use placeholder data for smooth transitions", async () => {
      const initialData = {
        days: [{ date: "2024-01-01", totalAmount: 100, entryCount: 1, currencies: ["CNY"] }],
        range: { startDate: "2024-01-01", endDate: "2024-01-31" },
        stats: { minAmount: 100, maxAmount: 100, avgAmount: 100, p80Amount: 100 },
      };

      vi.mocked(heatmapActions.getCalendarHeatmapForRange).mockResolvedValue(initialData);

      const { result, rerender } = renderHook(
        ({ endDate }: { endDate: string }) =>
          useCalendarHeatmapForRange(mockLedgerId, "2024-01-01", endDate),
        {
          wrapper: createWrapper(),
          initialProps: { endDate: "2024-01-31" },
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Change end date
      rerender({ endDate: "2024-02-29" });

      // Should show placeholder data while fetching
      expect(result.current.isPlaceholderData).toBe(true);
    });
  });
});
