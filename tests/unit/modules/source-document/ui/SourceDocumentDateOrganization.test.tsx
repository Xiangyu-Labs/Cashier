import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import { SourceDocumentDateOrganization } from "@/modules/source-document/ui/SourceDocumentDateOrganization";

// The rows render through AmountDisplay; resolve the conversion from the
// DTO's persisted value instead of hitting the exchange-rate query.
vi.mock("@/modules/currency/hooks/useAmountDisplay", () => ({
  useAmountDisplay: ({
    amount,
    currency,
    mainCurrency,
    persistedConvertedAmount,
  }: {
    amount: string;
    currency: string | null | undefined;
    mainCurrency: string;
    persistedConvertedAmount?: string | null;
  }) => {
    const isDifferentCurrency = currency != null && currency !== mainCurrency;
    const converted = persistedConvertedAmount ?? amount;
    return {
      converted,
      displayAmount: isDifferentCurrency ? converted : amount,
      isDifferentCurrency,
      status: isDifferentCurrency ? "success" : "idle",
      isLoading: false,
      isError: false,
      originalCurrency: currency ?? "?",
      mainCurrency,
    };
  },
}));

const entry: LedgerEntryEmbeddedViewDto = {
  id: "33333333-3333-4333-8333-333333333333",
  ledgerId: "11111111-1111-4111-8111-111111111111",
  categoryId: null,
  sourceDocumentId: "22222222-2222-4222-8222-222222222222",
  amount: "18.00",
  currency: "CNY",
  itemName: "早餐",
  description: null,
  convertedAmount: "18.00",
  exchangeRate: "1",
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  deletedAt: null,
};

describe("SourceDocumentDateOrganization", () => {
  it("shows the category icon for each suggested entry", () => {
    const categorised: LedgerEntryEmbeddedViewDto = {
      ...entry,
      categoryId: "55555555-5555-4555-8555-555555555555",
      category: {
        id: "55555555-5555-4555-8555-555555555555",
        ledgerId: entry.ledgerId,
        name: "餐饮",
        description: null,
        icon: "Utensils",
        sortOrder: 0,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
        deletedAt: null,
      },
    };

    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: categorised.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: {
                itemName: categorised.itemName,
                amount: categorised.amount,
                currency: "CNY",
              },
            },
          ],
        }}
        entries={[categorised]}
        disabled={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    // The row renders the same 32px circular chip the entry cards use.
    const chip = document.querySelector(".rounded-full.bg-surface2");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("h-8", "w-8");
    // Rows are the shared line-item component in its transparent variant, so
    // they don't paint an opaque block on the panel's tinted background.
    const row = chip?.closest("div");
    expect(row).toHaveClass("bg-transparent");
    expect(row).not.toHaveClass("bg-surface");
  });

  it("shows the entry category and note instead of the date-hint reason", () => {
    const categorised: LedgerEntryEmbeddedViewDto = {
      ...entry,
      description: "订阅扣费",
      categoryId: "55555555-5555-4555-8555-555555555555",
      category: {
        id: "55555555-5555-4555-8555-555555555555",
        ledgerId: entry.ledgerId,
        name: "会员",
        description: null,
        icon: "Crown",
        sortOrder: 0,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
        deletedAt: null,
      },
    };

    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: categorised.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: {
                itemName: categorised.itemName,
                amount: categorised.amount,
                currency: "CNY",
              },
            },
          ],
        }}
        entries={[categorised]}
        disabled={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("会员")).toBeInTheDocument();
    expect(screen.getByText("订阅扣费")).toBeInTheDocument();
    // The model's raw text no longer appears on the row.
    expect(screen.queryByText(/昨天/)).not.toBeInTheDocument();
  });

  it("renders each suggested amount with the currency symbol, not the code", () => {
    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: entry.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: { itemName: entry.itemName, amount: entry.amount, currency: "CNY" },
            },
          ],
        }}
        entries={[entry]}
        disabled={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("¥18.00")).toHaveClass("text-base", "font-semibold");
    expect(screen.queryByText("18.00 CNY")).not.toBeInTheDocument();
    // Entry rows share the line-item styling so the two lists line up.
    expect(screen.getByText("早餐")).toHaveClass("font-medium", "text-text");
  });

  it("keeps an adjusted date after finishing the draft and applies it", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: entry.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: { itemName: entry.itemName, amount: entry.amount, currency: "CNY" },
            },
          ],
        }}
        entries={[entry]}
        disabled={false}
        onApply={onApply}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "调整" }));
    fireEvent.change(screen.getByLabelText("早餐 的建议日期"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成调整" }));
    expect(screen.getByText(/移至 2026-09-08/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部应用" }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        suggestionId: "44444444-4444-4444-8444-444444444444",
        groups: [
          {
            id: "2026-09-08",
            entryDate: "2026-09-08",
            ledgerEntryIds: [entry.id],
          },
        ],
        appliedGroupIds: ["2026-09-08"],
      })
    );
  });

  it("stacks the converted amount above the original for a foreign-currency entry", () => {
    const usd: LedgerEntryEmbeddedViewDto = {
      ...entry,
      amount: "10.00",
      currency: "USD",
      convertedAmount: "72.00",
    };

    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: usd.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: { itemName: usd.itemName, amount: usd.amount, currency: "USD" },
            },
          ],
        }}
        entries={[usd]}
        mainCurrency="CNY"
        disabled={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const converted = screen.getByText("¥72.00");
    expect(converted).toHaveClass("text-base", "font-semibold");

    const original = screen.getByText((text) => text.startsWith("≈"));
    expect(original).toHaveClass("text-xs", "text-muted-foreground");
    expect(original.textContent).toContain("USD");

    // The original sits below the converted amount.
    expect(
      converted.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
