import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEntryFilters, type AdminEntryFiltersLabels } from "@/modules/admin/ui/AdminEntryFilters";

const routerReplaceMock = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/entries",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react") as typeof import("react");
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void } | null>(
    null
  );

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange == null ? {} : { onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const ctx = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => ctx?.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

const labels: AdminEntryFiltersLabels = {
  range: "Time range",
  currency: "Currency",
  category: "Category",
  sourceLink: "Source link",
  allCurrencies: "All currencies",
  allCategories: "All categories",
  allSourceLinks: "All source links",
  range24h: "Past 24 hours",
  range7d: "Past 7 days",
  range30d: "Past 30 days",
  rangeAll: "All time",
  sourceLinked: "Linked",
  sourceUnlinked: "Unlinked",
  resetFilters: "Reset filters",
};

describe("AdminEntryFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("updates range, currency, category, and source-link params while clearing detail and cursor", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("detail=entry-1&cursor=abc&limit=25"));

    const { rerender } = render(
      <AdminEntryFilters
        availableCurrencies={["USD", "EUR"]}
        availableCategories={[{ id: "category-1", name: "Meals" }]}
        filters={{ range: "all", sourceLink: "all" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Past 7 days"));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/entries?limit=25&range=7d", {
      scroll: false,
    });

    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams("range=7d&detail=entry-1&cursor=abc&limit=25"));

    rerender(
      <AdminEntryFilters
        availableCurrencies={["USD", "EUR"]}
        availableCategories={[{ id: "category-1", name: "Meals" }]}
        filters={{ range: "7d", sourceLink: "all", limit: "25" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("USD"));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/entries?range=7d&limit=25&currency=USD", {
      scroll: false,
    });

    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("range=7d&currency=USD&detail=entry-1&cursor=abc&limit=25")
    );

    rerender(
      <AdminEntryFilters
        availableCurrencies={["USD", "EUR"]}
        availableCategories={[{ id: "category-1", name: "Meals" }]}
        filters={{ range: "7d", currency: "USD", sourceLink: "all", limit: "25" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Meals"));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/admin/entries?range=7d&currency=USD&limit=25&categoryId=category-1",
      { scroll: false }
    );

    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("range=7d&currency=USD&categoryId=category-1&detail=entry-1&cursor=abc&limit=25")
    );

    rerender(
      <AdminEntryFilters
        availableCurrencies={["USD", "EUR"]}
        availableCategories={[{ id: "category-1", name: "Meals" }]}
        filters={{
          range: "7d",
          currency: "USD",
          categoryId: "category-1",
          sourceLink: "all",
          limit: "25",
        }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Linked"));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/admin/entries?range=7d&currency=USD&categoryId=category-1&limit=25&sourceLink=linked",
      { scroll: false }
    );
  });

  it("reset clears filters, detail, and cursor while preserving limit", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams(
        "range=7d&currency=USD&categoryId=category-1&sourceLink=linked&detail=entry-1&cursor=abc&limit=20"
      )
    );

    render(
      <AdminEntryFilters
        availableCurrencies={["USD", "EUR"]}
        availableCategories={[{ id: "category-1", name: "Meals" }]}
        filters={{
          range: "7d",
          currency: "USD",
          categoryId: "category-1",
          sourceLink: "linked",
        }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/entries?limit=20", {
      scroll: false,
    });
  });
});
