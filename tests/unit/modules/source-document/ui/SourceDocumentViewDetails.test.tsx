import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
