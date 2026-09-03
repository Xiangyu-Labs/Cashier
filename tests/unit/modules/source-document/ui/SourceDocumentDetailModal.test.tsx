import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocumentLight } from "@/modules/source-document/contracts";
import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onOpenChange,
    onSave,
    onDiscard,
  }: {
    open?: boolean;
    title: string;
    onOpenChange?: (open: boolean) => void;
    onSave?: () => void | Promise<void | boolean>;
    onDiscard?: () => void | Promise<void | boolean>;
  }) =>
    open ? (
      <div>
        <span>{title}</span>
        <button onClick={() => void onSave?.()}>confirm-save</button>
        <button onClick={() => void onDiscard?.()}>confirm-discard</button>
        <button onClick={() => onOpenChange?.(false)}>confirm-cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/editable-field", () => ({
  EditableField: () => null,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentViewDetails", () => ({
  SourceDocumentViewDetails: ({
    isEditMode,
    isSelectionMode,
    onSourceDocChange,
    onToggleSelectionMode,
  }: {
    isEditMode?: boolean;
    isSelectionMode: boolean;
    onSourceDocChange: (change: { title: string }) => void;
    onToggleSelectionMode: () => void;
  }) => (
    <div>
      <span>{isEditMode ? "editing" : "viewing"}</span>
      <span>{isSelectionMode ? "selecting" : "not-selecting"}</span>
      <button disabled={!isEditMode} onClick={() => onSourceDocChange({ title: "Changed" })}>
        change-draft
      </button>
      <button onClick={onToggleSelectionMode}>batch-toggle</button>
    </div>
  ),
}));

vi.mock("@/modules/ledger/ui/batch-action-toolbar", () => ({
  LedgerEntriesBatchActionToolbar: () => <div>batch-toolbar</div>,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentEditRetryDialog", () => ({
  SourceDocumentEditRetryDialog: () => null,
}));
vi.mock("@/modules/source-document/ui/AddLedgerEntryDialog", () => ({
  AddLedgerEntryDialog: () => null,
}));
vi.mock("@/modules/source-document/ui/SourceDocumentSplitDialog", () => ({
  SourceDocumentSplitDialog: () => null,
}));
vi.mock("@/modules/source-document/ui/use-diagnostic-messages", () => ({
  useDiagnosticMessages: () => ({ label: vi.fn(), description: vi.fn() }),
}));
vi.mock("@/lib/navigation/ledger-detail-navigation", () => ({
  openLedgerDetail: vi.fn(),
}));

const entry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  sourceDocumentId: "doc-1",
  categoryId: null,
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

const sourceDocument: SourceDocumentLight = {
  id: "doc-1",
  ledgerId: "ledger-1",
  title: "Receipt",
  text: null,
  files: [],
  status: "completed",
  type: "manual",
  anomalyReason: null,
  entryDate: "2026-07-28",
  createdAt: "2026-07-28T00:00:00.000Z",
  hasImages: false,
  supportedActions: [],
  errorCode: null,
  pendingRevisionId: null,
  activeRevisionId: "revision-1",
};

function modal(
  onSaveAll = vi.fn(async () => undefined),
  document: SourceDocumentLight = sourceDocument
) {
  return (
    <SourceDocumentDetailModal
      ledgerId="ledger-1"
      sourceDocument={document}
      ledgerEntries={[entry]}
      categories={[]}
      mainCurrency="CNY"
      preferredCurrencies={[]}
      open
      onClose={vi.fn()}
      onSaveAll={onSaveAll}
      onBatchUpdate={vi.fn(async () => ({ affectedCount: 1 }))}
      onBatchDeleteEntries={vi.fn(async () => [])}
    />
  );
}

function renderModal(onSaveAll = vi.fn(async () => undefined)) {
  return { onSaveAll, ...render(modal(onSaveAll)) };
}

describe("SourceDocumentDetailModal batch mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enters batch mode directly outside edit mode", () => {
    renderModal();
    fireEvent.click(screen.getByText("batch-toggle"));
    expect(screen.getByText("batch-toolbar")).toBeInTheDocument();
    expect(screen.getByText("selecting")).toBeInTheDocument();
    expect(screen.queryByText("edit")).not.toBeInTheDocument();
  });

  it("leaves an unchanged edit session before entering batch mode", () => {
    renderModal();
    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByText("editing")).toBeInTheDocument();
    fireEvent.click(screen.getByText("batch-toggle"));
    expect(screen.getByText("viewing")).toBeInTheDocument();
    expect(screen.getByText("batch-toolbar")).toBeInTheDocument();
  });

  it("saves a draft before entering batch mode", async () => {
    const { onSaveAll } = renderModal();
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));
    fireEvent.click(screen.getByText("batch-toggle"));
    expect(screen.getByText("batchModePendingTitle")).toBeInTheDocument();

    fireEvent.click(screen.getByText("confirm-save"));
    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("batch-toolbar")).toBeInTheDocument());
  });

  it("can discard a draft or cancel without changing modes", async () => {
    renderModal();
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));
    fireEvent.click(screen.getByText("batch-toggle"));
    fireEvent.click(screen.getByText("confirm-cancel"));
    expect(screen.getByText("editing")).toBeInTheDocument();
    expect(screen.queryByText("batch-toolbar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("batch-toggle"));
    fireEvent.click(screen.getByText("confirm-discard"));
    await waitFor(() => expect(screen.getByText("batch-toolbar")).toBeInTheDocument());
    expect(screen.getByText("viewing")).toBeInTheDocument();
  });

  it("resets editor state when the selected source document changes", () => {
    const onSaveAll = vi.fn(async () => undefined);
    const { rerender } = renderModal(onSaveAll);
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));
    expect(screen.getByText("editing")).toBeInTheDocument();

    rerender(
      modal(onSaveAll, {
        ...sourceDocument,
        id: "doc-2",
        title: "Second receipt",
        activeRevisionId: "revision-2",
      })
    );

    expect(screen.getByText("viewing")).toBeInTheDocument();
    expect(screen.queryByText("unsavedChanges")).not.toBeInTheDocument();
  });
});
