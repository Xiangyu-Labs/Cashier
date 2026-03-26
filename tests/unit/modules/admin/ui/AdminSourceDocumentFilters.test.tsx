import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminSourceDocumentFilters,
  type AdminSourceDocumentFiltersLabels,
} from "@/modules/admin/ui/AdminSourceDocumentFilters";

const routerReplaceMock = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/source-documents",
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

const labels: AdminSourceDocumentFiltersLabels = {
  status: "Status",
  type: "Type",
  range: "Time range",
  result: "Result",
  allStatuses: "All statuses",
  allTypes: "All types",
  allResults: "All results",
  statusQueued: "Queued",
  statusProcessing: "Processing",
  statusCompleted: "Completed",
  statusAnomaly: "Anomaly",
  statusFailed: "Failed",
  statusDeleted: "Deleted",
  range24h: "Past 24 hours",
  range7d: "Past 7 days",
  range30d: "Past 30 days",
  rangeAll: "All time",
  resultWithEntries: "With entries",
  resultWithoutEntries: "Without entries",
  resetFilters: "Reset filters",
};

describe("AdminSourceDocumentFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("updates status filters while clearing stale detail and cursor and preserving limit", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("cursor=abc123&detail=doc-1&limit=25"));

    render(
      <AdminSourceDocumentFilters
        availableTypes={["ai_parsed"]}
        filters={{ range: "all", result: "all" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Completed"));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/source-documents?limit=25&status=completed", {
      scroll: false,
    });
  });

  it("updates type, range, and result filters while keeping unrelated params stable", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=queued&detail=doc-1&cursor=old&limit=50")
    );

    const { rerender } = render(
      <AdminSourceDocumentFilters
        availableTypes={["ai_parsed", "manual"]}
        filters={{ status: "queued", range: "all", result: "all" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("manual"));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/admin/source-documents?status=queued&limit=50&type=manual",
      { scroll: false }
    );

    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=queued&type=manual&detail=doc-1&cursor=old&limit=50")
    );

    rerender(
      <AdminSourceDocumentFilters
        availableTypes={["ai_parsed", "manual"]}
        filters={{ status: "queued", type: "manual", range: "all", result: "all", limit: "50" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("Past 7 days"));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/admin/source-documents?status=queued&type=manual&limit=50&range=7d",
      { scroll: false }
    );

    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=queued&type=manual&range=7d&detail=doc-1&cursor=old&limit=50")
    );

    rerender(
      <AdminSourceDocumentFilters
        availableTypes={["ai_parsed", "manual"]}
        filters={{ status: "queued", type: "manual", range: "7d", result: "all", limit: "50" }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByText("With entries"));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/admin/source-documents?status=queued&type=manual&range=7d&limit=50&result=withEntries",
      { scroll: false }
    );
  });

  it("reset clears status, type, range, result, detail, and cursor while preserving limit", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams(
        "status=completed&type=ai_parsed&range=7d&result=withEntries&detail=doc-1&cursor=abc&limit=20"
      )
    );

    render(
      <AdminSourceDocumentFilters
        availableTypes={["ai_parsed"]}
        filters={{
          status: "completed",
          type: "ai_parsed",
          range: "7d",
          result: "withEntries",
        }}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/source-documents?limit=20", {
      scroll: false,
    });
  });
});
