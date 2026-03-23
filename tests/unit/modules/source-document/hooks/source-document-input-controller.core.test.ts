import { describe, expect, it, vi } from "vitest";
import {
  buildSubmitPayload,
  mergeModalImagesIntoEditableImages,
  resolveInitialEntryDate,
  toEditableImages,
} from "@/modules/source-document/hooks/source-document-input-controller.core";

describe("source-document-input-controller.core", () => {
  it("adds original image metadata when creating editable images", () => {
    expect(toEditableImages([{ data: "image-a", mimeType: "image/png" }])).toEqual([
      {
        data: "image-a",
        mimeType: "image/png",
        originalData: "image-a",
        originalMimeType: "image/png",
        isEdited: false,
      },
    ]);
  });

  it("includes originalImages only when at least one image is edited", () => {
    const editableImages = [
      {
        data: "edited-image",
        mimeType: "image/png",
        originalData: "original-image",
        originalMimeType: "image/png",
        isEdited: true,
      },
    ];

    expect(
      buildSubmitPayload("Lunch", editableImages, new Date("2026-03-20T00:00:00.000Z"))
    ).toMatchObject({
      text: "Lunch",
      images: [{ data: "edited-image", mimeType: "image/png" }],
      originalImages: [{ data: "original-image", mimeType: "image/png" }],
    });
  });

  it("marks an image as unedited again when modal save restores the original bytes", () => {
    const currentImages = toEditableImages([{ data: "original-image", mimeType: "image/png" }]);

    const restored = mergeModalImagesIntoEditableImages(currentImages, [
      { data: "original-image", mimeType: "image/png" },
    ]);

    expect(restored[0]?.isEdited).toBe(false);
  });

  it("falls back to now when initialData entryDate is missing or invalid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T09:00:00.000Z"));

    expect(resolveInitialEntryDate(undefined)).toEqual(new Date("2026-03-23T09:00:00.000Z"));
    expect(resolveInitialEntryDate("invalid-date")).toEqual(new Date("2026-03-23T09:00:00.000Z"));

    vi.useRealTimers();
  });
});
