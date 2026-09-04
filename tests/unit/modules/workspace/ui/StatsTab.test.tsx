import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEnhancedStats } from "@/modules/stats/actions";
import { StatsTab } from "@/modules/workspace/ui/StatsTab";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";
import type { Ledger } from "@/modules/ledger/contracts";

const { searchParamsState } = vi.hoisted(() => ({
  searchParamsState: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsState.current,
}));

vi.mock("@/i18n/routing", () => ({
  usePathname: () => "/ledgers/ledger-1",
}));

vi.mock("@/modules/stats/server-actions/get-enhanced-stats", () => ({
  getEnhancedStats: vi.fn(),
}));

const ledgerFixture: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  settings: { mainCurrency: "CNY" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const statsFixture: EnhancedStatsDto = {
  unconvertedCount: 0,
  summary: {
    total: "120",
    currency: "CNY",
    trend: { percent: 100, amount: "60" },
    dailyAverage: "20",
    comparison: {
      mode: "same_period",
      from: "2026-07-01",
      to: "2026-07-06",
      previousTotal: "60",
      amountDelta: "60",
      percent: 100,
    },
  },
  categories: [],
  chart: [],
  heatmap: {
    days: [],
    stats: { minAmount: "0", maxAmount: "0", avgAmount: "0", p80Amount: "0" },
  },
};

function renderStatsTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StatsTab ledgerId="ledger-1" ledger={ledgerFixture} ledgerToday="2026-08-24" />
    </QueryClientProvider>
  );
  return { queryClient, ...view };
}

describe("StatsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.current = new URLSearchParams();
  });

  it("shows the error panel on failure and refetches via the retry button", async () => {
    vi.mocked(getEnhancedStats).mockRejectedValue(new Error("boom"));
    renderStatsTab();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("总支出")).not.toBeInTheDocument();

    vi.mocked(getEnhancedStats).mockResolvedValueOnce(statsFixture);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(getEnhancedStats).toHaveBeenCalledTimes(2));
    await screen.findByText("¥120.00");
  });

  it("shows the error panel instead of rendering an oversized result", async () => {
    vi.mocked(getEnhancedStats).mockResolvedValue({
      ...statsFixture,
      chart: Array.from({ length: 121 }, (_, index) => ({
        date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        total: String(index),
      })),
    });

    renderStatsTab();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("¥120.00")).not.toBeInTheDocument();
  });

  it("keeps placeholder data paired with its resolved range descriptor", async () => {
    let resolveNext!: (value: EnhancedStatsDto) => void;
    vi.mocked(getEnhancedStats)
      .mockResolvedValueOnce(statsFixture)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve;
        })
      );
    const { queryClient, rerender } = renderStatsTab();
    await screen.findByText("¥120.00");
    expect(screen.getByText("2026年8月")).toBeInTheDocument();

    searchParamsState.current = new URLSearchParams("statsRange=week");
    rerender(
      <QueryClientProvider client={queryClient}>
        <StatsTab ledgerId="ledger-1" ledger={ledgerFixture} ledgerToday="2026-08-24" />
      </QueryClientProvider>
    );

    await waitFor(() => expect(getEnhancedStats).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "周" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2026年8月")).toBeInTheDocument();

    resolveNext(statsFixture);
  });
});
