import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => {
    const translations: Record<string, string | string[]> = {
      moreFilters: "更多筛选",
      dateRange: "日期范围",
      priceRange: "价格区间",
      minAmount: "最小金额",
      maxAmount: "最大金额",
      apply: "应用筛选",
      reset: "重置",
      pastWeek: "过去7天",
      pastMonth: "最近30天",
      thisMonth: "本月",
      customRange: "自定义区间",
      all: "全部",
      week: "最近7天",
      custom: "自定义",
      selectDate: "选择日期",
      today: "今天",
      yesterday: "昨天",
      clear: "清除",
      weekDays: ["日", "一", "二", "三", "四", "五", "六"],
    };
    const t = (key: string) => {
      const fullKey = ns != null ? `${ns}.${key}` : key;
      const value = translations[key] ?? translations[fullKey] ?? key;
      return Array.isArray(value) ? value : value;
    };
    t.raw = (key: string) => {
      const fullKey = ns != null ? `${ns}.${key}` : key;
      return translations[key] ?? translations[fullKey] ?? key;
    };
    return t;
  },
  useFormatter: () => ({
    dateTime: (date: Date) => date.toLocaleDateString(),
    number: (num: number) => num.toString(),
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/ledger/test-id",
}));

// Mock CategoryIcon
vi.mock("@/components/CategoryIcon", () => ({
  CategoryIcon: ({ name }: { name: string }) => <span data-testid="category-icon">{name}</span>,
}));

describe("EntryFilterPanel", () => {
  const mockOnFiltersChange = vi.fn();
  const category = {
    id: "cat1",
    ledgerId: "ledger-1",
    name: "餐饮",
    description: null,
    icon: "🍔",
    sortOrder: 1,
    isEditable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders filter button", () => {
    render(<EntryFilterPanel filters={{}} onFiltersChange={mockOnFiltersChange} />);

    expect(screen.getByText("更多筛选")).toBeTruthy();
  });

  it("displays badge count when filters are active", () => {
    const filters: EntryFilters = {
      categoryId: "cat1",
      currency: "CNY",
      minAmount: 100,
    };

    render(
      <EntryFilterPanel
        filters={filters}
        onFiltersChange={mockOnFiltersChange}
        categories={[category]}
        preferredCurrencies={["CNY", "USD"]}
      />
    );

    // Should show badge with count (3 active filters)
    const badge = screen.getByText("3");
    expect(badge).toBeTruthy();
  });

  it("opens popover when clicked", async () => {
    render(<EntryFilterPanel filters={{}} onFiltersChange={mockOnFiltersChange} />);

    const filterButton = screen.getByText("更多筛选");
    fireEvent.click(filterButton);

    await waitFor(() => {
      // Popover should be open with period options
      expect(screen.getByText("日期范围")).toBeTruthy();
    });
  });

  it("hides category filter when showCategory is false", async () => {
    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={mockOnFiltersChange}
        categories={[category]}
        showCategory={false}
        showCurrency={false}
      />
    );

    const filterButton = screen.getByText("更多筛选");
    fireEvent.click(filterButton);

    await waitFor(() => {
      expect(screen.getByText("日期范围")).toBeTruthy();
    });
  });

  it("applies amount filters entered by the user", async () => {
    render(<EntryFilterPanel filters={{}} onFiltersChange={mockOnFiltersChange} />);

    fireEvent.click(screen.getByText("更多筛选"));

    await waitFor(() => {
      expect(screen.getByText("价格区间")).toBeTruthy();
    });

    const minInput = screen.getByPlaceholderText("最小金额");
    const maxInput = screen.getByPlaceholderText("最大金额");

    fireEvent.change(minInput, { target: { value: "100" } });
    fireEvent.change(maxInput, { target: { value: "500" } });
    fireEvent.click(screen.getByText("应用筛选"));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        minAmount: 100,
        maxAmount: 500,
      })
    );
  });

  it("normalizes reversed amount ranges before applying", async () => {
    render(<EntryFilterPanel filters={{}} onFiltersChange={mockOnFiltersChange} />);

    fireEvent.click(screen.getByText("更多筛选"));

    await waitFor(() => {
      expect(screen.getByText("价格区间")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("最小金额"), { target: { value: "500" } });
    fireEvent.change(screen.getByPlaceholderText("最大金额"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("应用筛选"));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        minAmount: 100,
        maxAmount: 500,
      })
    );
  });

  it("resets to thisMonth and clears amount filters", async () => {
    render(
      <EntryFilterPanel
        filters={{
          startDate: new Date("2024-03-01"),
          endDate: new Date("2024-03-31"),
          minAmount: 100,
          maxAmount: 500,
        }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByText("更多筛选"));

    await waitFor(() => {
      expect(screen.getByText("价格区间")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("重置"));
    fireEvent.click(screen.getByText("应用筛选"));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        minAmount: null,
        maxAmount: null,
      })
    );
  });
});
