import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ComponentProps<"img">) => <img {...props} />,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "zh-CN",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === "imageAlt" ? `Image ${values?.index ?? ""}`.trim() : key,
}));

vi.mock("@/modules/currency/client", () => ({
  useAmountDisplay: ({
    amount,
    currency,
    mainCurrency,
  }: {
    amount: number;
    currency: string | null | undefined;
    mainCurrency: string;
  }) => ({
    converted: amount,
    displayAmount: amount,
    isDifferentCurrency:
      currency != null && currency !== "" && currency !== "unknown" && currency !== mainCurrency,
    isLoading: false,
    originalCurrency: currency ?? "?",
    mainCurrency,
  }),
}));

const defaultCategory: EntryCategory = {
  id: "cat-food",
  ledgerId: "ledger-1",
  name: "餐饮",
  description: null,
  icon: "Utensils",
  sortOrder: 1,
  isEditable: true,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

function createSourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "测试单据",
    text: null,
    imageUrls: [],
    status: "completed",
    type: "text",
    anomalyReason: null,
    entryDate: "2024-01-01",
    metadata: {},
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    deletedAt: null,
    hasImages: false,
    ...overrides,
  };
}

function createEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: defaultCategory.id,
    category: defaultCategory,
    itemName: "默认条目",
    amount: "12.00",
    currency: "CNY",
    convertedAmount: null,
    exchangeRate: null,
    description: null,
    sourceDocumentId: "doc-1",
    sourceDocument: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    deletedAt: null,
    ...overrides,
  };
}

function createEntries(): LedgerEntry[] {
  return [createEntry()];
}

function renderCard(
  overrides: Partial<ComponentProps<typeof SourceDocumentCard>> = {}
): ReturnType<typeof render> {
  return render(
    <SourceDocumentCard
      sourceDocument={createSourceDocument()}
      ledgerEntries={createEntries()}
      categories={[defaultCategory]}
      mainCurrency="CNY"
      status="completed"
      {...overrides}
    />
  );
}

describe("SourceDocumentCard", () => {
  it("routes clicks to details in normal mode and selection in selection mode", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onToggleSelect = vi.fn();

    const { rerender } = renderCard({
      onViewDetails,
      defaultExpanded: true,
    });

    await user.click(screen.getByText("测试单据"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);

    rerender(
      <SourceDocumentCard
        sourceDocument={createSourceDocument()}
        ledgerEntries={createEntries()}
        categories={[defaultCategory]}
        mainCurrency="CNY"
        status="completed"
        selectionMode
        isSelected={false}
        onToggleSelect={onToggleSelect}
        onViewDetails={onViewDetails}
        defaultExpanded
      />
    );

    await user.click(screen.getByTestId("source-document-card-root"));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it("renders completed entries by category sortOrder and then amount descending", () => {
    const renderedCategory: EntryCategory = {
      ...defaultCategory,
      id: "cat-rendered",
      name: "已排序",
      sortOrder: 1,
    };
    const laterCategory: EntryCategory = {
      ...defaultCategory,
      id: "cat-later",
      name: "较后",
      sortOrder: 3,
    };

    renderCard({
      ledgerEntries: [
        createEntry({
          id: "entry-3",
          itemName: "第三个",
          amount: "12.00",
          categoryId: laterCategory.id,
          category: laterCategory,
        }),
        createEntry({
          id: "entry-2",
          itemName: "第二个",
          amount: "50.00",
          categoryId: renderedCategory.id,
          category: renderedCategory,
        }),
        createEntry({
          id: "entry-1",
          itemName: "第一个",
          amount: "88.00",
          categoryId: renderedCategory.id,
          category: renderedCategory,
        }),
      ],
      defaultExpanded: true,
    });

    const entryNames = within(screen.getByTestId("source-document-card-body"))
      .getAllByText(/^(第一个|第二个|第三个)$/)
      .map((node) => node.textContent);

    expect(entryNames).toEqual(["第一个", "第二个", "第三个"]);
  });

  it("renders image and text preview instead of completed entries for non-completed cards", () => {
    renderCard({
      sourceDocument: createSourceDocument({
        text: "OCR preview",
        imageUrls: ["base64-image"],
      }),
      ledgerEntries: [createEntry({ itemName: "不应显示的条目" })],
      status: "processing",
      defaultExpanded: true,
    });

    expect(screen.getByText("OCR preview")).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByText("不应显示的条目")).toBeNull();
  });

  it("toggles the expanded body without routing the click to details", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();

    renderCard({
      onViewDetails,
      defaultExpanded: false,
    });

    expect(screen.queryByTestId("source-document-card-body")).toBeNull();

    await user.click(screen.getByRole("button", { name: "expand" }));
    expect(screen.getByTestId("source-document-card-body")).toBeTruthy();
    expect(onViewDetails).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "collapse" }));
    expect(screen.queryByTestId("source-document-card-body")).toBeNull();
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it("shows retry loading state and delete action from the menu", async () => {
    const user = userEvent.setup();
    let resolveRetry: (() => void) | null = null;

    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );
    const onDelete = vi.fn();

    renderCard({
      sourceDocument: createSourceDocument({ type: "image" }),
      ledgerEntries: [],
      status: "failed",
      onRetry,
      onDelete,
      defaultExpanded: true,
    });

    await user.click(screen.getByLabelText("source-document-card-actions"));
    expect(screen.getByText("retry")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();

    await user.click(screen.getByText("retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText("source-document-card-actions"));
    expect(screen.getByText("retry").closest("[data-disabled]")).not.toBeNull();

    resolveRetry?.();
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it.each([
    { status: "processing" as const, anomalyReason: null, expectedLabel: "statusRunning" },
    { status: "failed" as const, anomalyReason: null, expectedLabel: "error" },
    { status: "anomaly" as const, anomalyReason: "duplicate detected", expectedLabel: "duplicate detected" },
  ])("shows processing status instead of totals for $status cards", ({ status, anomalyReason, expectedLabel }) => {
    renderCard({
      ledgerEntries: [],
      status,
      anomalyReason,
    });

    expect(screen.getByTestId("status-label").textContent).toBe(expectedLabel);
    expect(screen.queryByText("12.00")).toBeNull();
  });

  it("shows a multi-currency total trigger and popover copy for completed cards", async () => {
    const user = userEvent.setup();

    renderCard({
      ledgerEntries: [
        createEntry({
          id: "usd-entry",
          amount: "10.00",
          currency: "USD",
          convertedAmount: "70.00",
          itemName: "美元条目",
        }),
        createEntry({
          id: "cny-entry",
          amount: "20.00",
          currency: "CNY",
          convertedAmount: null,
          itemName: "人民币条目",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /CNY\s*90.00/i }));

    expect(screen.getByText("currencyBreakdown")).toBeTruthy();
    expect(screen.getByText("convertedTotal")).toBeTruthy();
    expect(screen.getByText(/USD/)).toBeTruthy();
  });
});
