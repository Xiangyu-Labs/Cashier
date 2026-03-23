import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSourceDocumentInputDraft } from "@/modules/source-document/hooks/useSourceDocumentInputDraft";

describe("useSourceDocumentInputDraft", () => {
  it("does not overwrite user edits when initialData changes for the same document", () => {
    const { result, rerender } = renderHook(
      (props: {
        sourceDocumentId?: string;
        initialData?: {
          text?: string;
          images?: Array<{ data: string; mimeType: string }>;
          entryDate?: string;
        };
      }) => useSourceDocumentInputDraft(props),
      {
        initialProps: {
          sourceDocumentId: "doc-1",
          initialData: { text: "Original text" },
        },
      }
    );

    act(() => {
      result.current.setText("User edited text");
    });

    rerender({
      sourceDocumentId: "doc-1",
      initialData: { text: "Server update" },
    });

    expect(result.current.text).toBe("User edited text");
  });

  it("reinitializes draft state when switching to a different document", async () => {
    const { result, rerender } = renderHook(
      (props: {
        sourceDocumentId?: string;
        initialData?: {
          text?: string;
          images?: Array<{ data: string; mimeType: string }>;
          entryDate?: string;
        };
      }) => useSourceDocumentInputDraft(props),
      {
        initialProps: {
          sourceDocumentId: "doc-1",
          initialData: {
            text: "Document A",
            images: [{ data: "image-a", mimeType: "image/png" }],
            entryDate: "2026-03-18",
          },
        },
      }
    );

    act(() => {
      result.current.setText("User edits");
      result.current.setEntryDate(new Date("2026-03-20T00:00:00.000Z"));
    });

    rerender({
      sourceDocumentId: "doc-2",
      initialData: {
        text: "Document B",
        images: [{ data: "image-b", mimeType: "image/jpeg" }],
        entryDate: "2026-03-19",
      },
    });

    await waitFor(() => {
      expect(result.current.text).toBe("Document B");
    });

    expect(result.current.modalImages).toEqual([{ data: "image-b", mimeType: "image/jpeg" }]);
    expect(result.current.entryDate.getTime()).toBe(new Date(2026, 2, 19).getTime());
  });

  it("marks edited images and clears the edited flag when modal save restores the original image", () => {
    const { result } = renderHook(() =>
      useSourceDocumentInputDraft({
        initialData: {
          images: [{ data: "original-image", mimeType: "image/png" }],
        },
      })
    );

    act(() => {
      result.current.handleModalSave([{ data: "edited-image", mimeType: "image/png" }]);
    });

    expect(result.current.images[0]).toMatchObject({
      data: "edited-image",
      mimeType: "image/png",
      originalData: "original-image",
      originalMimeType: "image/png",
      isEdited: true,
    });

    act(() => {
      result.current.handleModalSave([{ data: "original-image", mimeType: "image/png" }]);
    });

    expect(result.current.images[0]).toMatchObject({
      data: "original-image",
      mimeType: "image/png",
      originalData: "original-image",
      originalMimeType: "image/png",
      isEdited: false,
    });
  });
});
