import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerPageSkeleton } from "@/components/skeletons";

describe("LedgerPageSkeleton", () => {
  it("renders the entries skeleton by default", () => {
    render(<LedgerPageSkeleton />);

    expect(screen.queryByTestId("entries-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("stats-tab-skeleton")).toBeNull();
  });

  it("renders the stats skeleton when activeTab is stats", () => {
    render(<LedgerPageSkeleton activeTab="stats" />);

    expect(screen.queryByTestId("stats-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("entries-tab-skeleton")).toBeNull();
  });

  it("renders the details skeleton when activeTab is details", () => {
    render(<LedgerPageSkeleton activeTab="details" />);

    expect(screen.queryByTestId("details-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("entries-tab-skeleton")).toBeNull();
  });

  it("renders the settings skeleton when activeTab is settings", () => {
    render(<LedgerPageSkeleton activeTab="settings" />);

    expect(screen.queryByTestId("settings-tab-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("entries-tab-skeleton")).toBeNull();
  });
});
