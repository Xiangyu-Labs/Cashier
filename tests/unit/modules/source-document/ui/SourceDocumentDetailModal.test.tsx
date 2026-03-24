import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children?: ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => onOpenChange?.(false)}>request-close</button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onSave,
    onDiscard,
    confirmLabel,
    saveLabel,
    discardLabel,
  }: {
    open?: boolean;
    onConfirm?: () => void;
    onSave?: () => void;
    onDiscard?: () => void;
    confirmLabel?: string;
    saveLabel?: string;
    discardLabel?: string;
  }) =>
    open ? (
      <div>
        {onDiscard != null && (
          <button onClick={onDiscard}>{discardLabel ?? "discardChanges"}</button>
        )}
        {onSave != null ? (
          <button onClick={onSave}>{saveLabel ?? "save"}</button>
        ) : (
          <button onClick={onConfirm}>{confirmLabel ?? "confirm"}</button>
        )}
      </div>
    ) : null,
}));

vi.mock("@/components/ui/editable-field", () => ({
  EditableField: ({ value }: { value: string }) => <div>{value}</div>,
}));

vi.mock("@/modules/ledger/ui", () => ({
  LedgerEntriesBatchActionToolbar: () => null,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentEditRetryDialog", () => ({
  SourceDocumentEditRetryDialog: () => null,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentViewDetails", () => ({
  SourceDocumentViewDetails: ({
    onEntryChange,
  }: {
    onEntryChange: (entryId: string, changes: { itemName: string }) => void;
  }) => (
    <button onClick={() => onEntryChange("entry-1", { itemName: "Coffee beans" })}>
      edit-entry
    </button>
  ),
}));

import { SourceDocumentDetailModal } from "@/modules/source-document/ui/SourceDocumentDetailModal";

function buildSourceDocument() {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: "Receipt text",
    imageUrls: [],
    status: "completed" as const,
    type: "ai_parsed" as const,
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    hasImages: false,
  };
}

function buildLedgerEntry() {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: null,
    sourceDocumentId: "doc-1",
    amount: "10.00",
    currency: "USD",
    itemName: "Coffee",
    description: null,
    convertedAmount: "72.00",
    exchangeRate: "7.2",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    category: null,
  };
}

describe("SourceDocumentDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not close the modal when save-and-close fails", async () => {
    const onClose = vi.fn();
    const onUpdateEntry = vi.fn().mockRejectedValueOnce(new Error("save failed"));

    render(
      <SourceDocumentDetailModal
        ledgerId="ledger-1"
        open
        onClose={onClose}
        sourceDocument={buildSourceDocument()}
        ledgerEntries={[buildLedgerEntry()]}
        categories={[]}
        onUpdateSourceDoc={vi.fn().mockResolvedValue(undefined)}
        onUpdateImages={vi.fn().mockResolvedValue(undefined)}
        onUpdateEntry={onUpdateEntry}
        onBatchUpdate={vi.fn().mockResolvedValue(undefined)}
        onDeleteEntry={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("request-close"));
    fireEvent.click(await screen.findByText("save"));

    await waitFor(() => {
      expect(onUpdateEntry).toHaveBeenCalledWith("entry-1", {
        itemName: "Coffee beans",
      });
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("saveAllError");
  });
});
