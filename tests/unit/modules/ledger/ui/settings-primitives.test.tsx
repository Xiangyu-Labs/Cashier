import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrencySection } from "@/modules/ledger/ui/CurrencySection";
import { SettingsSection } from "@/modules/ledger/ui/settings/SettingsSection";

describe("settings primitives", () => {
  it("uses the shared select and settings heading hierarchy for main currency", () => {
    render(
      <CurrencySection
        settings={{ mainCurrency: "CNY", currencies: ["CNY"] }}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: "主货币" })).toHaveTextContent("CNY");
    expect(screen.getByRole("heading", { name: "主货币" })).toHaveClass(
      "text-sm",
      "font-medium",
      "text-text"
    );
  });

  it("applies one splitter rule to every direct setting after the first", () => {
    render(
      <SettingsSection title="Account">
        <div>Email</div>
        <div>Password</div>
        <div>API keys</div>
        <div>Sign out</div>
      </SettingsSection>
    );

    const items = screen.getByText("Email").parentElement;
    expect(items).toHaveClass("[&>*+*]:border-t", "[&>*+*]:border-border", "[&>*+*]:pt-4");
  });
});
