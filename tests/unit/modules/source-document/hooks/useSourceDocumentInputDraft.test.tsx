import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSourceDocumentInputDraft } from "@/modules/source-document/hooks/useSourceDocumentInputDraft";

describe("useSourceDocumentInputDraft", () => {
  it("compares a retry draft with its complete initial seed", () => {
    const initialData = {
      text: "Prefilled receipt",
      images: [
        {
          data: "data:image/png;base64,AQ==",
          mimeType: "image/png",
          storedFileId: "file-1",
        },
      ],
      entryDate: "2026-08-19",
    };
    const { result } = renderHook(() =>
      useSourceDocumentInputDraft({ sourceDocumentId: "doc-1", initialData })
    );

    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setText("Changed receipt"));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.setText(initialData.text));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.removeImage(0));
    expect(result.current.isDirty).toBe(true);

    act(() =>
      result.current.setImages(() =>
        initialData.images.map((image) => ({
          ...image,
          originalData: image.data,
          originalMimeType: image.mimeType,
          isEdited: false,
        }))
      )
    );
    expect(result.current.isDirty).toBe(false);
  });
});
