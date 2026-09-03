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
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children?: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      {children}
      <button onClick={() => onOpenChange?.(false)}>dialog-close</button>
    </div>
  ),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onOpenChange,
    onConfirm,
    onSave,
    onDiscard,
  }: {
    open?: boolean;
    title: string;
    onOpenChange?: (open: boolean) => void;
    onConfirm?: () => void | Promise<void | boolean>;
    onSave?: () => void | Promise<void | boolean>;
    onDiscard?: () => void | Promise<void | boolean>;
  }) =>
    open ? (
      <div>
        <span>{title}</span>
        <button onClick={() => void (onSave ?? onConfirm)?.()}>confirm-save</button>
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
    onSelectEntry,
    onAddEntry,
  }: {
    isEditMode?: boolean;
    isSelectionMode: boolean;
    onSourceDocChange: (change: { title: string }) => void;
    onToggleSelectionMode: () => void;
    onSelectEntry: (entryId: string, selected: boolean) => void;
    onAddEntry?: () => void;
  }) => (
    <div>
      <span>{isEditMode ? "editing" : "viewing"}</span>
      <span>{isSelectionMode ? "selecting" : "not-selecting"}</span>
      <button disabled={!isEditMode} onClick={() => onSourceDocChange({ title: "Changed" })}>
        change-draft
      </button>
      <button disabled={!isEditMode} onClick={() => onSourceDocChange({ title: "Changed again" })}>
        change-draft-again
      </button>
      <button onClick={onToggleSelectionMode}>batch-toggle</button>
      <button onClick={() => onSelectEntry("entry-1", true)}>select-first</button>
      <button onClick={onAddEntry}>add-entry</button>
    </div>
  ),
}));

vi.mock("@/modules/ledger/ui/batch-action-toolbar", () => ({
  LedgerEntriesBatchActionToolbar: ({ onSplit }: { onSplit?: () => void }) => (
    <div>
      batch-toolbar
      {onSplit != null ? <button onClick={onSplit}>open-split</button> : null}
    </div>
  ),
}));

vi.mock("@/modules/source-document/ui/SourceDocumentEditRetryDialog", () => ({
  SourceDocumentEditRetryDialog: () => null,
}));
vi.mock("@/modules/source-document/ui/AddLedgerEntryDialog", () => ({
  AddLedgerEntryDialog: ({ open }: { open: boolean }) =>
    open ? <div>add-entry-dialog</div> : null,
}));
vi.mock("@/modules/source-document/ui/SourceDocumentSplitDialog", () => ({
  SourceDocumentSplitDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (entryDate: string) => Promise<void>;
  }) => (open ? <button onClick={() => void onSubmit("2026-09-03")}>submit-split</button> : null),
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

const secondEntry: LedgerEntry = {
  ...entry,
  id: "entry-2",
  itemName: "Dinner",
  amount: "18.00",
  convertedAmount: "18.00",
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
  document: SourceDocumentLight = sourceDocument,
  overrides: {
    ledgerEntries?: LedgerEntry[];
    onClose?: () => void;
    onReload?: () => Promise<void>;
    onSplit?: React.ComponentProps<typeof SourceDocumentDetailModal>["onSplit"];
    onAddEntry?: React.ComponentProps<typeof SourceDocumentDetailModal>["onAddEntry"];
    onAbandonCandidate?: React.ComponentProps<
      typeof SourceDocumentDetailModal
    >["onAbandonCandidate"];
    onCancelProcessing?: React.ComponentProps<
      typeof SourceDocumentDetailModal
    >["onCancelProcessing"];
    isAbandoning?: boolean;
    isCancelling?: boolean;
  } = {}
) {
  return (
    <SourceDocumentDetailModal
      ledgerId="ledger-1"
      sourceDocument={document}
      ledgerEntries={overrides.ledgerEntries ?? [entry]}
      categories={[]}
      mainCurrency="CNY"
      preferredCurrencies={[]}
      open
      onClose={overrides.onClose ?? vi.fn()}
      {...(overrides.onReload !== undefined ? { onReload: overrides.onReload } : {})}
      onSaveAll={onSaveAll}
      {...(overrides.onSplit !== undefined ? { onSplit: overrides.onSplit } : {})}
      {...(overrides.onAddEntry !== undefined ? { onAddEntry: overrides.onAddEntry } : {})}
      {...(overrides.onAbandonCandidate !== undefined
        ? { onAbandonCandidate: overrides.onAbandonCandidate }
        : {})}
      {...(overrides.onCancelProcessing !== undefined
        ? { onCancelProcessing: overrides.onCancelProcessing }
        : {})}
      {...(overrides.isAbandoning !== undefined ? { isAbandoning: overrides.isAbandoning } : {})}
      {...(overrides.isCancelling !== undefined ? { isCancelling: overrides.isCancelling } : {})}
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

  it("shows a revision conflict and reloads server data before saving", async () => {
    const onSaveAll = vi.fn(async () => undefined);
    const onReload = vi.fn(async () => undefined);
    const { rerender } = render(modal(onSaveAll, sourceDocument, { onReload }));
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));

    rerender(modal(onSaveAll, { ...sourceDocument, activeRevisionId: "revision-2" }, { onReload }));

    expect(screen.getByRole("alert")).toHaveTextContent("revisionConflict");
    expect(screen.getByText("saveChanges")).toBeDisabled();
    fireEvent.click(screen.getByText("reloadServerData"));

    await waitFor(() => expect(onReload).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onSaveAll).not.toHaveBeenCalled();
  });

  it("saves pending changes before continuing to another action", async () => {
    const onSaveAll = vi.fn(async () => undefined);
    render(modal(onSaveAll, sourceDocument, { onAddEntry: vi.fn(async () => undefined) }));
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));
    fireEvent.click(screen.getByText("add-entry"));

    expect(screen.getByText("saveBeforeActionTitle")).toBeInTheDocument();
    expect(screen.queryByText("add-entry-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-save"));

    await waitFor(() => expect(onSaveAll).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText("add-entry-dialog")).toBeInTheDocument());
  });

  it("requires confirmation before closing with unsaved changes", () => {
    const onClose = vi.fn();
    render(modal(undefined, sourceDocument, { onClose }));
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));
    fireEvent.click(screen.getByText("dialog-close"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("unsavedChanges")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-discard"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reuses the save operation ID after a failed attempt", async () => {
    const onSaveAll = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    renderModal(onSaveAll);
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));

    fireEvent.click(screen.getByText("saveChanges"));
    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("saveChanges"));
    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(2));

    expect(onSaveAll.mock.calls[0]![0].operationId).toBe(onSaveAll.mock.calls[1]![0].operationId);
  });

  it("uses a new save operation ID when the payload changes after a failed attempt", async () => {
    const onSaveAll = vi.fn().mockRejectedValue(new Error("temporary failure"));
    renderModal(onSaveAll);
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("change-draft"));

    fireEvent.click(screen.getByText("saveChanges"));
    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("change-draft-again"));
    fireEvent.click(screen.getByText("saveChanges"));
    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(2));

    expect(onSaveAll.mock.calls[1]![0]).toMatchObject({
      changes: { sourceDoc: { title: "Changed again" } },
    });
    expect(onSaveAll.mock.calls[1]![0].operationId).not.toBe(
      onSaveAll.mock.calls[0]![0].operationId
    );
  });

  it("reuses split identities when retrying the same payload", async () => {
    const onSplit = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        sourceDocumentId: "doc-1",
        splitSourceDocumentId: "doc-2",
        movedEntryCount: 1,
      });
    render(
      modal(
        undefined,
        { ...sourceDocument, supportedActions: ["split_entries"] },
        { ledgerEntries: [entry, secondEntry], onSplit }
      )
    );
    fireEvent.click(screen.getByText("batch-toggle"));
    fireEvent.click(screen.getByText("select-first"));
    fireEvent.click(screen.getByText("open-split"));

    fireEvent.click(screen.getByText("submit-split"));
    await waitFor(() => expect(onSplit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("submit-split"));
    await waitFor(() => expect(onSplit).toHaveBeenCalledTimes(2));

    const firstInput = onSplit.mock.calls[0]![0];
    const secondInput = onSplit.mock.calls[1]![0];
    expect(firstInput).toMatchObject({
      expectedRevisionId: "revision-1",
      ledgerEntryIds: ["entry-1"],
      entryDate: "2026-09-03",
    });
    expect(secondInput.operationId).toBe(firstInput.operationId);
    expect(secondInput.newSourceDocumentId).toBe(firstInput.newSourceDocumentId);
    await waitFor(() => expect(screen.queryByText("submit-split")).not.toBeInTheDocument());
  });

  it("shows pending indicators for abandon and cancel actions", () => {
    render(
      modal(
        undefined,
        {
          ...sourceDocument,
          supportedActions: ["abandon_candidate", "cancel_processing"],
        },
        {
          onAbandonCandidate: vi.fn(async () => undefined),
          onCancelProcessing: vi.fn(async () => undefined),
          isAbandoning: true,
          isCancelling: true,
        }
      )
    );

    expect(screen.getByText("abandon").closest("button")?.querySelector("svg")).toHaveClass(
      "animate-spin"
    );
    expect(
      screen.getByText("cancelProcessing").closest("button")?.querySelector("svg")
    ).toHaveClass("animate-spin");
  });
});
