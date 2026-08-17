import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { LedgerEntryDetailModal } from "@/modules/ledger/ui/LedgerEntryDetailModal";

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count == null ? key : `${key}:${values.count}`,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
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
      <button onClick={() => onOpenChange?.(false)}>attempt-close</button>
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open?: boolean;
    onConfirm: () => void | Promise<void>;
  }) => (open ? <button onClick={() => void onConfirm()}>confirm-delete</button> : null),
}));

vi.mock("@/modules/ledger/ui/LedgerEntryViewDetails", () => ({
  LedgerEntryViewDetails: ({
    onFieldChange,
    onSave,
    onEdit,
    onDelete,
    isEditMode,
    busy,
  }: {
    onFieldChange: (changes: { itemName: string }) => void;
    onSave: () => void | Promise<void>;
    onEdit: () => void;
    onDelete: () => void;
    isEditMode: boolean;
    busy?: boolean;
  }) => (
    <div>
      <button disabled={busy} onClick={onEdit}>
        edit-entry
      </button>
      <button disabled={!isEditMode || busy} onClick={() => onFieldChange({ itemName: "Updated" })}>
        change-name
      </button>
      <button disabled={!isEditMode || busy} onClick={() => void onSave()}>
        save-entry
      </button>
      <button disabled={busy} onClick={onDelete}>
        delete-entry
      </button>
    </div>
  ),
}));

const ledgerEntry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: null,
  sourceDocumentId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Original",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
  deletedAt: null,
};

function renderModal({
  onUpdate = vi.fn(async () => undefined),
  onDelete = vi.fn(async () => undefined),
  onClose = vi.fn(),
}: {
  onUpdate?: (data: { itemName?: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose?: () => void;
} = {}) {
  render(
    <LedgerEntryDetailModal
      ledgerEntry={ledgerEntry}
      categories={[]}
      open
      onClose={onClose}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
}

describe("LedgerEntryDetailModal feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows success only after the save mutation resolves", async () => {
    let resolveSave!: () => void;
    const onUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    renderModal({ onUpdate });

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("change-name"));
    fireEvent.click(screen.getByText("save-entry"));

    expect(onUpdate).toHaveBeenCalledWith({ itemName: "Updated" });
    expect(toastSuccessMock).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("saveAllSuccess:1"));
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("freezes editing and ignores close requests until save settles", async () => {
    let resolveSave!: () => void;
    const onClose = vi.fn();
    const onUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    renderModal({ onUpdate, onClose });

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("change-name"));
    fireEvent.click(screen.getByText("save-entry"));
    await waitFor(() => expect(screen.getByText("save-entry")).toBeDisabled());
    expect(screen.getByText("change-name")).toBeDisabled();
    expect(screen.getByText("delete-entry")).toBeDisabled();
    fireEvent.click(screen.getByText("attempt-close"));
    expect(onClose).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(screen.getByText("edit-entry")).not.toBeDisabled());
    expect(screen.getByText("save-entry")).toBeDisabled();
    fireEvent.click(screen.getByText("attempt-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports one save error and keeps the pending change available for retry", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("save failed"));
    renderModal({ onUpdate });

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("change-name"));
    fireEvent.click(screen.getByText("save-entry"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("saveFailed"));
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("save-entry"));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    expect(onUpdate).toHaveBeenLastCalledWith({ itemName: "Updated" });
  });

  it("leaves delete feedback to the mutation and closes only after success", async () => {
    const onClose = vi.fn();
    const onDelete = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce(undefined);
    renderModal({ onDelete, onClose });

    fireEvent.click(screen.getByText("delete-entry"));
    fireEvent.click(screen.getByText("confirm-delete"));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));

    expect(onClose).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("delete-entry"));
    fireEvent.click(screen.getByText("confirm-delete"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("preserves pending changes while a lower detail is temporarily hidden", async () => {
    const onUpdate = vi.fn(async () => undefined);
    const { rerender } = render(
      <LedgerEntryDetailModal
        ledgerEntry={ledgerEntry}
        categories={[]}
        open
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("change-name"));
    rerender(
      <LedgerEntryDetailModal
        ledgerEntry={ledgerEntry}
        categories={[]}
        open={false}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn(async () => undefined)}
      />
    );
    rerender(
      <LedgerEntryDetailModal
        ledgerEntry={ledgerEntry}
        categories={[]}
        open
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByText("edit-entry"));
    fireEvent.click(screen.getByText("save-entry"));
  });

  it("keeps a failed detail open and retries it in place", async () => {
    const onClose = vi.fn();
    const onReload = vi.fn(async () => undefined);
    render(
      <LedgerEntryDetailModal
        ledgerEntry={null}
        loadError
        onReload={onReload}
        categories={[]}
        open
        onClose={onClose}
        onUpdate={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByText("loadError")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retry"));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the error UI available when an in-place retry fails", async () => {
    const onClose = vi.fn();
    const onReload = vi.fn().mockRejectedValue(new Error("retry failed"));
    render(
      <LedgerEntryDetailModal
        ledgerEntry={null}
        loadError
        onReload={onReload}
        categories={[]}
        open
        onClose={onClose}
        onUpdate={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByText("retry"));

    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("retry")).not.toBeDisabled());
    expect(screen.getByText("loadError")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
