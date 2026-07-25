import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CalculatorInput } from "@/components/ui/calculator-input";

const { currentLocale } = vi.hoisted(() => {
  /** Mutable locale ref switched per test to test en/zh translations */
  const ref: { value: string } = { value: "zh" };
  return { currentLocale: ref };
});

vi.mock("next-intl", async () => {
  const en = (await import("messages/en.json")).default as Record<
    string,
    Record<string, string>
  >;
  const zh = (await import("messages/zh.json")).default as Record<
    string,
    Record<string, string>
  >;

  return {
    useTranslations: (namespace?: string) => {
      const msgs = currentLocale.value === "en" ? en : zh;
      return (key: string, values?: Record<string, string | number>) => {
        const nsMessages = namespace ? msgs[namespace] : undefined;
        let msg = nsMessages?.[key];
        if (msg == null) {
          for (const ns in msgs) {
            if (msgs[ns]?.[key] != null) {
              msg = msgs[ns][key];
              break;
            }
          }
        }
        if (msg == null) return key;
        if (values != null) {
          Object.entries(values).forEach(([k, v]) => {
            msg = (msg as string).replace(`{${k}}`, String(v));
          });
        }
        return msg;
      };
    },
    useLocale: () => currentLocale.value,
    useMessages: () => (currentLocale.value === "en" ? en : zh),
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

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

  describe.each(["en", "zh"] as const)("localization (%s)", (locale) => {
    beforeEach(() => {
      currentLocale.value = locale;
    });

    it("uses the localized amountAriaLabel for the amount button", () => {
      render(<CalculatorInput value={42} onChange={() => {}} />);

      const expected = locale === "en" ? "Amount" : "金额";
      const button = screen.getByRole("button", { name: expected });
      expect(button).toBeDefined();
    });

    it("uses the localized openCalculator aria-label on the calculator opener", () => {
      currentLocale.value = locale;
      render(<CalculatorInput value={42} onChange={() => {}} />);

      const amountLabel = locale === "en" ? "Amount" : "金额";
      fireEvent.click(screen.getByRole("button", { name: amountLabel }));

      const expected = locale === "en" ? "Open calculator" : "打开计算器";
      const openBtn = screen.getByRole("button", { name: expected });
      expect(openBtn).toBeDefined();
    });

    it("uses the localized title in the calculator dialog", () => {
      currentLocale.value = locale;
      render(<CalculatorInput value={42} onChange={() => {}} />);

      const amountLabel = locale === "en" ? "Amount" : "金额";
      fireEvent.click(screen.getByRole("button", { name: amountLabel }));

      const openLabel = locale === "en" ? "Open calculator" : "打开计算器";
      fireEvent.click(screen.getByRole("button", { name: openLabel }));

      const expected = locale === "en" ? "Calculator" : "计算器";
      expect(screen.getByText(expected)).toBeDefined();
    });
  });
});
