import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CalculatorInput } from "@/components/ui/calculator-input";

const { currentLocale } = vi.hoisted(() => {
  /** Mutable locale ref switched per test to test en/zh translations */
  const ref: { value: string } = { value: "zh" };
  return { currentLocale: ref };
});

vi.mock("next-intl", async () => {
  const en = (await import("messages/en.json")).default as Record<string, Record<string, string>>;
  const zh = (await import("messages/zh.json")).default as Record<string, Record<string, string>>;

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
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe("CalculatorInput", () => {
  it("initializes a new inline draft from the latest controlled value", () => {
    const { rerender } = render(<CalculatorInput value={12} onChange={() => {}} />);

    rerender(<CalculatorInput value={34.5} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "金额" }));

    expect(screen.getByRole("textbox")).toHaveValue("34.50");
  });

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

  it("commits a valid inline value on Enter and outside click", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={12} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "18.25" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(18.25);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "21.50" } });
    fireEvent.mouseDown(document.body);
    expect(onChange).toHaveBeenLastCalledWith(21.5);
  });

  it("commits a valid inline value when Tab moves focus away", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={12} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "19.75" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(19.75);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps invalid inline input open and announces an error on outside click", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={12} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.mouseDown(document.body);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("请输入有效金额。");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores the controlled value when inline editing is cancelled with Escape", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={12} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "99.00" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("submits a complete calculator expression with Enter", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={12} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.click(screen.getByRole("button", { name: "打开计算器" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(15);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("normalizes backspacing the final calculator digit to zero", () => {
    const onChange = vi.fn();
    render(<CalculatorInput value={0} onChange={onChange} ariaLabel="amount" />);

    fireEvent.click(screen.getByRole("button", { name: "amount" }));
    fireEvent.click(screen.getByRole("button", { name: "打开计算器" }));
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Backspace" });
    fireEvent.keyDown(dialog, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(0);
    expect(screen.queryByText("Error")).not.toBeInTheDocument();
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
