import { StrictMode } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadFilesMock } = vi.hoisted(() => ({
  loadFilesMock: vi.fn(),
}));

vi.mock("@/modules/source-document/hooks/source-document-input-images", () => ({
  loadSourceDocumentInputFiles: loadFilesMock,
}));

vi.mock("@/modules/source-document/hooks/useSourceDocumentSubmitMutations", () => ({
  useSourceDocumentSubmitMutations: () => ({
    isPending: false,
    progress: null,
    canCancel: false,
    submit: vi.fn(),
    cancel: vi.fn(),
  }),
}));

import { useSourceDocumentInputController } from "@/modules/source-document/hooks/useSourceDocumentInputController";

const messages = {
  retrySuccess: "Retried",
  retryError: "Retry failed",
  imageTooLarge: (fileName: string) => `${fileName} is too large`,
  imageUnsupported: (fileName: string) => `${fileName} is unsupported`,
  imageReadError: "Read failed",
  imageUploadError: "Image upload failed",
  networkError: "Network failed",
  validationError: "Validation failed",
  createError: "Create failed",
  tooManyImages: "Too many images",
};

describe("useSourceDocumentInputController", () => {
  beforeEach(() => {
    loadFilesMock.mockReset();
  });

  it("keeps accepting asynchronously loaded images under Strict Mode", async () => {
    loadFilesMock.mockResolvedValue([
      {
        kind: "ready",
        image: {
          data: "data:image/png;base64,AQ==",
          mimeType: "image/png",
        },
      },
    ]);
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(
      () => useSourceDocumentInputController({ ledgerId: "ledger-1", messages }),
      { wrapper }
    );
    const input = document.createElement("input");
    Object.defineProperty(input, "files", {
      value: [new File([new Uint8Array([1])], "receipt.png", { type: "image/png" })],
    });

    act(() => {
      result.current.handleFileInputChange({ target: input } as ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => expect(result.current.images).toHaveLength(1));
    expect(result.current.isPreparingImages).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });
});
