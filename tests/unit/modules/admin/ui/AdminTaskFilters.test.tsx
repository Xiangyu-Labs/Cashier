import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTaskFilters, type AdminTaskFiltersLabels } from "@/modules/admin/ui/AdminTaskFilters";

const routerReplaceMock = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/tasks",
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
    }) => <SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>,
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

const labels: AdminTaskFiltersLabels = {
  status: "Status",
  type: "Type",
  range: "Time range",
  allStatuses: "All statuses",
  allTypes: "All types",
  statusPending: "Pending",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
  range24h: "Past 24 hours",
  range7d: "Past 7 days",
  range30d: "Past 30 days",
  rangeAll: "All time",
  resetFilters: "Reset filters",
};

describe("AdminTaskFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("replaces the URL and clears cursor when the status filter changes", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("cursor=abc123&limit=25"));

    render(
      <AdminTaskFilters
        availableTypes={["parse_source_document"]}
        filters={{ status: undefined, type: undefined, range: "all" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Failed"));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/tasks?limit=25&status=failed", {
      scroll: false,
    });
  });

  it("keeps limit while changing range and resets cursor", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("limit=50&status=running&cursor=old"));

    render(
      <AdminTaskFilters
        availableTypes={["parse_source_document"]}
        filters={{ status: "running", type: undefined, range: "all" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Past 7 days"));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/tasks?limit=50&status=running&range=7d", {
      scroll: false,
    });
  });

  it("reset filters removes status, type, range, and cursor while preserving limit", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=failed&type=parse_source_document&range=7d&cursor=abc&limit=20")
    );

    render(
      <AdminTaskFilters
        availableTypes={["parse_source_document"]}
        filters={{ status: "failed", type: "parse_source_document", range: "7d" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/tasks?limit=20", { scroll: false });
  });
});
