import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerPageSkeleton } from "@/components/skeletons";
import { parseLedgerTab } from "@/modules/workspace/tabs";

describe("ledger page loading state", () => {
  it("uses the stats skeleton for server search params with tab=stats", () => {
    const activeTab = parseLedgerTab({ tab: "stats" });

    render(<LedgerPageSkeleton activeTab={activeTab} />);

    expect(screen.queryByTestId("stats-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("entries-tab-skeleton")).toBeNull();
  });

  it("uses the details skeleton for server search params with tab=details", () => {
    const activeTab = parseLedgerTab({ tab: "details" });

    render(<LedgerPageSkeleton activeTab={activeTab} />);

    expect(screen.queryByTestId("details-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("entries-tab-skeleton")).toBeNull();
  });

  it("falls back to the entries skeleton when tab is missing", () => {
    const activeTab = parseLedgerTab({});

    render(<LedgerPageSkeleton activeTab={activeTab} />);

    expect(screen.queryByTestId("entries-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("stats-tab-skeleton")).toBeNull();
    expect(screen.queryByTestId("details-tab-skeleton")).toBeNull();
  });
});
