import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";

vi.mock("@/modules/source-document/hooks/useSourceDocumentRecoveryMutations", () => ({
  useSourceDocumentRecoveryMutations: () => ({
    retry: vi.fn(),
    cancelProcessing: vi.fn(),
    abandonCandidate: vi.fn(),
    isRetrying: false,
    isCancelling: false,
    isAbandoning: false,
  }),
}));

vi.mock("@/modules/currency/ui", () => ({
  AmountDisplay: () => <span>CNY 12.00</span>,
  AmountText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const sourceDocument: SourceDocument = {
  id: "doc-1",
  ledgerId: "ledger-1",
  title: "Receipt",
  text: "Lunch",
  files: [],
  status: "completed",
  type: "ai_parsed",
  anomalyReason: null,
  entryDate: "2026-07-28",
  metadata: {},
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  deletedAt: null,
  hasImages: false,
  supportedActions: ["retry", "edit_retry", "delete"],
  errorCode: null,
  pendingRevisionId: null,
};

const ledgerEntry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: null,
  sourceDocumentId: "doc-1",
  amount: "12.00",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.00",
  exchangeRate: "1",
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  deletedAt: null,
};

describe("SourceDocumentCard interactions", () => {
  it("starts expanded by default and opens details only from the main region", () => {
    const onViewDetails = vi.fn();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[ledgerEntry]}
        status="completed"
        onViewDetails={onViewDetails}
      />
    );

    expect(screen.getByTestId("source-document-card-body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Receipt/i }));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("source-document-card-root"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it("supports a collapsed default and repeated expansion", async () => {
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[ledgerEntry]}
        status="completed"
        defaultExpanded={false}
      />
    );

    const toggle = screen.getByRole("button", { name: /展开|expand/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("source-document-card-body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /折叠|collapse/i }));
    await waitFor(() =>
      expect(screen.queryByTestId("source-document-card-body")).not.toBeInTheDocument()
    );
  });

  it("opens an expanded ledger entry without opening the document", () => {
    const onViewDetails = vi.fn();
    const onViewLedgerEntry = vi.fn();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[ledgerEntry]}
        status="completed"
        onViewDetails={onViewDetails}
        onViewLedgerEntry={onViewLedgerEntry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Lunch/i }));
    expect(onViewLedgerEntry).toHaveBeenCalledWith(ledgerEntry);
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it("does not open details from the actions menu", () => {
    const onViewDetails = vi.fn();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[]}
        status="completed"
        onViewDetails={onViewDetails}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /更多操作|more actions/i }));
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it("closes the non-modal actions menu with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[]}
        status="completed"
        onDelete={vi.fn()}
      />
    );
    const trigger = screen.getByRole("button", { name: /更多操作|more actions/i });
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("uses one full-card selection control and preserves expansion state", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onToggleSelect = vi.fn();
    const { rerender } = render(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[ledgerEntry]}
        status="completed"
        onViewDetails={onViewDetails}
        selectionMode
        onToggleSelect={onToggleSelect}
      />
    );

    expect(screen.getByTestId("source-document-card-body")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    const selectionControl = screen.getByRole("checkbox", { name: /Receipt/ });
    await user.click(selectionControl);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onViewDetails).not.toHaveBeenCalled();

    rerender(
      <SourceDocumentCard
        sourceDocument={sourceDocument}
        ledgerEntries={[ledgerEntry]}
        status="completed"
        onViewDetails={onViewDetails}
      />
    );
    expect(screen.getByTestId("source-document-card-body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /折叠|collapse/i }));
    await waitFor(() =>
      expect(screen.queryByTestId("source-document-card-body")).not.toBeInTheDocument()
    );
  });

  it.each(["processing", "failed"] as const)(
    "shows the localized untitled fallback while %s",
    (status) => {
      render(
        <SourceDocumentCard
          sourceDocument={{ ...sourceDocument, title: null, status }}
          ledgerEntries={[]}
          status={status}
        />
      );

      expect(screen.getByText(/Untitled Bill|未命名账单/i)).toBeInTheDocument();
    }
  );
});
