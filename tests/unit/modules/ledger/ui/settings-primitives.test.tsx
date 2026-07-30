import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("searches and toggles preferred currencies with immediate saves", async () => {
    const onUpdateSettings = vi.fn();
    render(
      <CurrencySection
        settings={{ mainCurrency: "CNY", currencies: ["CNY", "USD"] }}
        onUpdateSettings={onUpdateSettings}
      />
    );

    const trigger = screen.getByRole("button", { name: /preferred currencies|偏好货币/i });
    expect(trigger).toHaveTextContent(/CNY, USD/);
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText(/search currencies|搜索币种/i), {
      target: { value: "jp" },
    });
    expect(screen.getByText("JPY")).toBeInTheDocument();
    expect(screen.queryByText("USD")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("JPY"));
    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith({ currencies: ["CNY", "USD", "JPY"] })
    );
    fireEvent.change(screen.getByLabelText(/search currencies|搜索币种/i), {
      target: { value: "usd" },
    });
    fireEvent.click(screen.getByText("USD"));
    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenLastCalledWith({ currencies: ["CNY", "JPY"] })
    );
  });
});
