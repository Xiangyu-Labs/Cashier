import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
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
  SourceDocumentImageModal: ({
    open,
    initialIndex,
    images,
  }: {
    open: boolean;
    initialIndex: number;
    images: Array<{ storedFileId?: string }>;
  }) => (
    <div
      data-testid="image-viewer-state"
      data-open={open}
      data-index={initialIndex}
      data-file-ids={images.map((image) => image.storedFileId).join(",")}
    />
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
    version: 1,
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
    canEdit: true,
    errorCode: null,
  };
}

function renderWithQueryClient(element: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function renderDetails(count: number, isLoadingImages = false) {
  const sourceDocument = documentWithFiles(count);
  return renderWithQueryClient(
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
      onToggleSelectionMode={vi.fn()}
      interactionDisabled
    />
  );
}

describe("SourceDocumentViewDetails image stage", () => {
  it("uses the same stable stage geometry while images are loading", () => {
    renderDetails(1, true);
    expect(screen.getByTestId("source-document-image-stage-loading")).toHaveClass("aspect-[4/3]");
    expect(screen.queryByTestId("source-document-image-stage")).not.toBeInTheDocument();
  });

  it("uses the authenticated stored-file route and hides thumbnails for one image", () => {
    renderDetails(1);
    const stage = screen.getByTestId("source-document-image-stage");
    expect(stage).toHaveClass("aspect-[4/3]");
    expect(stage.querySelector("img")).toHaveAttribute("src", "/api/stored-files/file-1");
    expect(stage.querySelector("img")).not.toHaveAttribute("src", expect.stringContaining("blob:"));
    expect(screen.getAllByRole("button", { name: /图片 1|image 1/i })).toHaveLength(1);
    expect(screen.getByTestId("image-viewer-state")).toHaveAttribute("data-file-ids", "file-1");
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
    expect(screen.getByTestId("image-viewer-state")).toHaveAttribute(
      "data-file-ids",
      "file-1,file-2"
    );
  });
});

describe("SourceDocumentViewDetails selection", () => {
  it("shows the batch selection entry outside edit mode", () => {
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
    const onToggleSelectionMode = vi.fn();

    renderWithQueryClient(
      <SourceDocumentViewDetails
        sourceDocument={documentWithFiles(0)}
        ledgerEntries={[entry]}
        categories={[]}
        pendingChanges={{ sourceDoc: {}, entries: {} }}
        selectedEntryIds={[]}
        isSelectionMode={false}
        isEditMode={false}
        onSourceDocChange={vi.fn()}
        onEntryChange={vi.fn()}
        onSelectEntry={vi.fn()}
        onToggleSelectionMode={onToggleSelectionMode}
      />
    );

    fireEvent.click(screen.getByTitle(/select|选择/i));
    expect(onToggleSelectionMode).toHaveBeenCalledTimes(1);
  });

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
      onToggleSelectionMode: vi.fn(),
    };
    const queryClient = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <SourceDocumentViewDetails {...commonProps} isSelectionMode />
      </QueryClientProvider>
    );

    const input = screen.getByDisplayValue("Edited lunch");
    expect(input.closest("[inert]")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /Lunch/i });
    expect(checkbox.querySelector("span")).toHaveClass("top-3");
    expect(checkbox.querySelector("span")).not.toHaveClass("-translate-y-1/2");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(checkbox);
    expect(onSelectEntry).toHaveBeenCalledTimes(1);
    expect(onSelectEntry).toHaveBeenCalledWith("entry-1", true);

    rerender(
      <QueryClientProvider client={queryClient}>
        <SourceDocumentViewDetails {...commonProps} isSelectionMode={false} />
      </QueryClientProvider>
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Edited lunch").closest("[inert]")).toBeNull();
  });
});
