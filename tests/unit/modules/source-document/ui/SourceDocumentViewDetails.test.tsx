import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { SourceDocumentViewDetails } from "@/modules/source-document/ui/SourceDocumentViewDetails";

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    alt,
    ...props
  }: React.ComponentProps<"img"> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={alt ?? ""} />
  ),
}));

vi.mock("@/modules/source-document/ui/SourceDocumentImageModal", () => ({
  SourceDocumentImageModal: ({ open, initialIndex }: { open: boolean; initialIndex: number }) => (
    <div data-testid="image-viewer-state" data-open={open} data-index={initialIndex} />
  ),
}));

vi.mock("@/modules/source-document/ui/EditableLedgerEntryItem", () => ({
  EditableLedgerEntryItem: ({
    ledgerEntry,
    pendingChanges,
  }: {
    ledgerEntry: LedgerEntry;
    pendingChanges?: { itemName?: string };
  }) => (
    <input
      aria-label="Entry name"
      value={pendingChanges?.itemName ?? ledgerEntry.itemName}
      readOnly
    />
  ),
}));

function documentWithFiles(count: number): SourceDocument {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: null,
    files: Array.from({ length: count }, (_, index) => ({
      id: `file-${index + 1}`,
      contentType: "image/png",
      byteSize: 100,
      originalFilename: `${index + 1}.png`,
    })),
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-28",
    metadata: {},
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    deletedAt: null,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
  };
}

function renderDetails(count: number, isLoadingImages = false) {
  const sourceDocument = documentWithFiles(count);
  const urls = new Map(sourceDocument.files.map((file, index) => [file.id, `blob:image-${index}`]));
  return render(
    <SourceDocumentViewDetails
      sourceDocument={sourceDocument}
      ledgerEntries={[]}
      categories={[]}
      pendingChanges={{ sourceDoc: {}, entries: {} }}
      selectedEntryIds={[]}
      isSelectionMode={false}
      isLoadingImages={isLoadingImages}
      onSourceDocChange={vi.fn()}
      onEntryChange={vi.fn()}
      onSelectEntry={vi.fn()}
      onSelectAllEntries={vi.fn()}
      onToggleSelectionMode={vi.fn()}
      readOnly
      offlineImageUrls={urls}
    />
  );
}

describe("SourceDocumentViewDetails image stage", () => {
  it("uses the same stable stage geometry while images are loading", () => {
    renderDetails(1, true);
    expect(screen.getByTestId("source-document-image-stage-loading")).toHaveClass("aspect-[4/3]");
    expect(screen.queryByTestId("source-document-image-stage")).not.toBeInTheDocument();
  });

  it("hides thumbnails for a single offline image", () => {
    renderDetails(1);
    const stage = screen.getByTestId("source-document-image-stage");
    expect(stage).toHaveClass("aspect-[4/3]");
    expect(stage.querySelector("img")).toHaveClass("object-contain");
    expect(screen.getAllByRole("button", { name: /图片 1|image 1/i })).toHaveLength(1);
  });

  it("switches thumbnails independently and opens the viewer at the active index", () => {
    renderDetails(2);
    fireEvent.click(screen.getByRole("button", { name: /图片 2|image 2/i }));
    expect(screen.getByTestId("source-document-image-stage")).toHaveAccessibleName(
      /图片 2|image 2/i
    );
    fireEvent.click(screen.getByTestId("source-document-image-stage"));
    expect(screen.getByTestId("image-viewer-state")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("image-viewer-state")).toHaveAttribute("data-index", "1");
  });
});

describe("SourceDocumentViewDetails selection", () => {
  it("freezes the editable card and keeps pending changes when selection mode exits", () => {
    const entry: LedgerEntry = {
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
    const pendingChanges = {
      sourceDoc: {},
      entries: { "entry-1": { itemName: "Edited lunch" } },
    };
    const onSelectEntry = vi.fn();
    const commonProps = {
      sourceDocument: documentWithFiles(0),
      ledgerEntries: [entry],
      categories: [],
      pendingChanges,
      selectedEntryIds: [],
      onSourceDocChange: vi.fn(),
      onEntryChange: vi.fn(),
      onSelectEntry,
      onSelectAllEntries: vi.fn(),
      onToggleSelectionMode: vi.fn(),
    };
    const { rerender } = render(<SourceDocumentViewDetails {...commonProps} isSelectionMode />);

    const input = screen.getByDisplayValue("Edited lunch");
    expect(input.closest("[inert]")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Lunch/i }));
    expect(onSelectEntry).toHaveBeenCalledTimes(1);
    expect(onSelectEntry).toHaveBeenCalledWith("entry-1", true);

    rerender(<SourceDocumentViewDetails {...commonProps} isSelectionMode={false} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Edited lunch").closest("[inert]")).toBeNull();
  });
});
