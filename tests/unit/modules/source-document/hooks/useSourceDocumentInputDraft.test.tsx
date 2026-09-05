import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentInputDraft } from "@/modules/source-document/hooks/useSourceDocumentInputDraft";

describe("useSourceDocumentInputDraft", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

    act(() => result.current.setImages(() => initialData.images.map((image) => ({ ...image }))));
    expect(result.current.isDirty).toBe(false);
  });

  it("releases object URLs on removal, reset, replacement, and unmount", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const image = (data: string) => ({
      data,
      mimeType: "image/jpeg",
      file: new File([data], `${data}.jpg`, { type: "image/jpeg" }),
      objectUrl: true as const,
    });
    const { result, unmount } = renderHook(() => useSourceDocumentInputDraft({}));

    act(() => result.current.setImages([image("blob:remove"), image("blob:reset")]));
    act(() => result.current.removeImage(0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:remove");

    act(() => result.current.resetDraft());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:reset");

    act(() => result.current.setImages([image("blob:replace")]));
    act(() => result.current.setImages([image("blob:unmount")]));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:replace");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:unmount");
    expect(revokeObjectURL).toHaveBeenCalledTimes(4);
  });
});
