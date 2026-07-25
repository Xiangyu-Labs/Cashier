import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { CalculatorInput } from "@/components/ui/calculator-input";

// zh.json messages are used by the useTranslations mock (see setup.common.ts)
import zhMessages from "messages/zh.json";

const messages = zhMessages as Record<string, unknown>;

describe("CalculatorInput", () => {
  it("keeps the same typography when switching into inline edit mode", () => {
    render(
      <CalculatorInput
        value={0}
        onChange={() => {}}
        ariaLabel="test-amount"
        displayClassName="text-3xl font-bold font-mono text-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "test-amount" }));
    const input = screen.getByRole("textbox");

    expect(input.className).toContain("font-mono");
    expect(input.className).toContain("text-3xl");
    expect(input.className).not.toContain("!text-base");
  });

  it("uses localized aria-label for the amount button when no override is provided", () => {
    render(
      <NextIntlClientProvider messages={messages} locale="zh">
        <CalculatorInput value={42} onChange={() => {}} />
      </NextIntlClientProvider>
    );

    const button = screen.getByRole("button", { name: "金额" });
    expect(button).toBeDefined();
  });
});
