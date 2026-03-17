import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EntryFilterPanel, type EntryFilters } from "@/features/ledger/components/EntryFilterPanel";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => {
    const translations: Record<string, string | string[]> = {
      moreFilters: "更多筛选",
      dateRange: "日期范围",
      all: "全部",
      thisMonth: "本月",
      week: "最近7天",
      custom: "自定义",
      selectDate: "选择日期",
      today: "今天",
      yesterday: "昨天",
      clear: "清除",
      weekDays: ["日", "一", "二", "三", "四", "五", "六"],
    };
    const t = (key: string) => {
      const fullKey = ns ? `${ns}.${key}` : key;
      const value = translations[key] || translations[fullKey] || key;
      return Array.isArray(value) ? value : value;
    };
    t.raw = (key: string) => {
      const fullKey = ns ? `${ns}.${key}` : key;
      return translations[key] || translations[fullKey] || key;
    };
    return t;
  },
  useFormatter: () => ({
    dateTime: (date: Date) => date.toLocaleDateString(),
    number: (num: number) => num.toString(),
  }),
}));

// Mock CategoryIcon
vi.mock("@/components/CategoryIcon", () => ({
  CategoryIcon: ({ name }: { name: string }) => <span data-testid="category-icon">{name}</span>,
}));

describe("EntryFilterPanel", () => {
  const mockOnFiltersChange = vi.fn();

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
        categories={[{ id: "cat1", name: "餐饮", icon: "🍔", sortOrder: 1 }]}
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
        categories={[{ id: "cat1", name: "餐饮", icon: "🍔", sortOrder: 1 }]}
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
});
