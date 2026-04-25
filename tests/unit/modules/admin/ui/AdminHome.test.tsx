import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminHome } from "@/modules/admin/ui/AdminHome";

describe("AdminHome", () => {
  it("renders the localized intro copy and stat cards", () => {
    render(
      <AdminHome
        stats={{
          totalUsers: 5,
          totalLedgers: 3,
          totalEntries: 42,
          totalSourceDocuments: 10,
          totalTasks: 7,
          totalCategories: 8,
          totalServiceCredentials: 2,
          totalAccounts: 1,
          totalCurrencyRates: 4,
          totalOTPTokens: 0,
        }}
        labels={{
          title: "Admin overview",
          description: "Manage internal tools and users.",
          totalUsers: "Total Users",
          totalLedgers: "Total Ledgers",
          totalEntries: "Total Entries",
          totalSourceDocuments: "Total Source Documents",
          totalTasks: "Total Tasks",
          totalCategories: "Total Categories",
          totalServiceCredentials: "Total Service Credentials",
          totalAccounts: "Total Accounts",
          totalCurrencyRates: "Total Currency Rates",
          totalOTPTokens: "Total OTP Tokens",
        }}
      />
    );

    expect(screen.getByText("Admin overview")).toBeTruthy();
    expect(screen.getByText("Manage internal tools and users.")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Total Users")).toBeTruthy();
  });
});
