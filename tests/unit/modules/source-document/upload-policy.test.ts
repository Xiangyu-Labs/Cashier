/**
 * Upload Policy Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_NORMALIZED_BYTES_PER_FILE,
  MAX_NORMALIZED_BYTES_PER_REVISION,
  MAX_MEGAPIXELS_PER_FILE,
  MAX_TEXT_CHARACTERS,
  SUPPORTED_MIME_TYPES,
  SUPPORTED_MIME_SET,
  validateFileUpload,
  validateImageProcessing,
  validateRevisionUpload,
  validateFileCount,
  validateAggregateFileCount,
  sanitizeMimeType,
} from "@/modules/source-document/upload-policy";

describe("upload-policy constants", () => {
  it("has the designed Web defaults", () => {
    expect(MAX_FILES).toBe(3);
    expect(MAX_ORIGINAL_BYTES_PER_FILE).toBe(3 * 1024 * 1024);
    expect(MAX_NORMALIZED_BYTES_PER_FILE).toBe(4 * 1024 * 1024);
    expect(MAX_NORMALIZED_BYTES_PER_REVISION).toBe(3 * 1024 * 1024);
    expect(MAX_MEGAPIXELS_PER_FILE).toBe(16);
    expect(MAX_TEXT_CHARACTERS).toBe(20000);
  });

  it("lists supported MIME types with no duplicates", () => {
    expect(SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0);
    const unique = new Set(SUPPORTED_MIME_TYPES);
    expect(unique.size).toBe(SUPPORTED_MIME_TYPES.length);
  });

  it("has SUPPORTED_MIME_SET matching the array", () => {
    for (const mime of SUPPORTED_MIME_TYPES) {
      expect(SUPPORTED_MIME_SET.has(mime)).toBe(true);
    }
  });
});

describe("validateFileUpload", () => {
  it("accepts valid files within limits", () => {
    expect(() => validateFileUpload({ contentType: "image/jpeg", byteSize: 1024 })).not.toThrow();
    expect(() =>
      validateFileUpload({ contentType: "image/png", byteSize: MAX_ORIGINAL_BYTES_PER_FILE })
    ).not.toThrow();
  });

  it("rejects unsupported MIME types", () => {
    expect(() => validateFileUpload({ contentType: "application/pdf", byteSize: 1024 })).toThrow(
      "Unsupported content type"
    );
    expect(() => validateFileUpload({ contentType: "image/tiff", byteSize: 1024 })).toThrow(
      "Unsupported content type"
    );
  });

  it("rejects zero or negative byte sizes", () => {
    expect(() => validateFileUpload({ contentType: "image/jpeg", byteSize: 0 })).toThrow(
      "Invalid byte size"
    );
    expect(() => validateFileUpload({ contentType: "image/jpeg", byteSize: -1 })).toThrow(
      "Invalid byte size"
    );
  });

  it("rejects non-integer byte sizes", () => {
    expect(() => validateFileUpload({ contentType: "image/jpeg", byteSize: 1.5 })).toThrow(
      "Invalid byte size"
    );
  });

  it("rejects files exceeding the maximum original bytes", () => {
    expect(() =>
      validateFileUpload({
        contentType: "image/jpeg",
        byteSize: MAX_ORIGINAL_BYTES_PER_FILE + 1,
      })
    ).toThrow("exceeds maximum original size");
  });

  it("accepts each supported MIME type", () => {
    for (const mime of SUPPORTED_MIME_TYPES) {
      expect(() => validateFileUpload({ contentType: mime, byteSize: 1024 })).not.toThrow();
    }
  });
});

describe("validateImageProcessing", () => {
  it("accepts images within pixel limits", () => {
    expect(() =>
      validateImageProcessing({ width: 1920, height: 1080, format: "jpeg" })
    ).not.toThrow();
  });

  it("rejects images exceeding the megapixel limit", () => {
    // 5000x4000 = 20 MP > 16 MP
    expect(() => validateImageProcessing({ width: 5000, height: 4000, format: "jpeg" })).toThrow(
      "exceed maximum"
    );
  });

  it("rejects unsupported image formats", () => {
    expect(() => validateImageProcessing({ width: 100, height: 100, format: "tiff" })).toThrow(
      "Unsupported image format"
    );
  });

  it("accepts supported image formats", () => {
    expect(() =>
      validateImageProcessing({ width: 100, height: 100, format: "jpeg" })
    ).not.toThrow();
    expect(() => validateImageProcessing({ width: 100, height: 100, format: "png" })).not.toThrow();
    expect(() =>
      validateImageProcessing({ width: 100, height: 100, format: "webp" })
    ).not.toThrow();
  });
});

describe("validateRevisionUpload", () => {
  it("accepts files within the aggregate limit", () => {
    expect(() => validateRevisionUpload(0, MAX_NORMALIZED_BYTES_PER_REVISION)).not.toThrow();
    expect(() =>
      validateRevisionUpload(
        MAX_NORMALIZED_BYTES_PER_REVISION / 2,
        MAX_NORMALIZED_BYTES_PER_REVISION / 2
      )
    ).not.toThrow();
  });

  it("rejects files exceeding the aggregate limit", () => {
    expect(() => validateRevisionUpload(MAX_NORMALIZED_BYTES_PER_REVISION, 1)).toThrow(
      "exceeds revision limit"
    );
  });

  it("rejects when both values together exceed the limit", () => {
    const half = MAX_NORMALIZED_BYTES_PER_REVISION / 2;
    expect(() => validateRevisionUpload(half, half + 1)).toThrow("exceeds revision limit");
  });
});

describe("validateFileCount", () => {
  it("accepts valid file counts", () => {
    expect(() => validateFileCount(1)).not.toThrow();
    expect(() => validateFileCount(MAX_FILES)).not.toThrow();
    expect(() => validateFileCount(2)).not.toThrow();
  });

  it("rejects zero or negative counts", () => {
    expect(() => validateFileCount(0)).toThrow("must be between 1 and");
    expect(() => validateFileCount(-1)).toThrow("must be between 1 and");
  });

  it("rejects counts above MAX_FILES", () => {
    expect(() => validateFileCount(MAX_FILES + 1)).toThrow("must be between 1 and");
  });
});

describe("validateAggregateFileCount", () => {
  it("accepts valid combined counts within MAX_FILES", () => {
    expect(() => validateAggregateFileCount(0, 3, 0)).not.toThrow();
    expect(() => validateAggregateFileCount(3, 0, 0)).not.toThrow();
    expect(() => validateAggregateFileCount(1, 2, 0)).not.toThrow();
  });

  it("rejects combined counts exceeding MAX_FILES", () => {
    expect(() => validateAggregateFileCount(3, 1, 0)).toThrow("exceeds maximum of 3 files");
    expect(() => validateAggregateFileCount(2, 2, 0)).toThrow("exceeds maximum of 3 files");
    expect(() => validateAggregateFileCount(1, 2, 1)).toThrow("exceeds maximum of 3 files");
    expect(() => validateAggregateFileCount(0, 0, 4)).toThrow("exceeds maximum of 3 files");
  });

  it("accepts zero counts across all categories", () => {
    expect(() => validateAggregateFileCount(0, 0, 0)).not.toThrow();
  });

  it("rejects count just above MAX_FILES", () => {
    expect(() => validateAggregateFileCount(MAX_FILES, 1, 0)).toThrow(
      "exceeds maximum of 3 files"
    );
  });
});

describe("sanitizeMimeType", () => {
  it("trusts detected MIME over declared", () => {
    expect(sanitizeMimeType("image/gif", "image/png")).toBe("image/png");
  });

  it("falls back to declared when detected is null", () => {
    expect(sanitizeMimeType("image/png", null)).toBe("image/png");
  });

  it("falls back to declared when detected is unsupported", () => {
    expect(sanitizeMimeType("image/jpeg", "image/tiff")).toBe("image/jpeg");
  });

  it("throws when both declared and detected are unsupported", () => {
    expect(() => sanitizeMimeType("image/tiff", "image/bmp")).toThrow("Unsupported MIME type");
  });

  it("is case-insensitive", () => {
    expect(sanitizeMimeType("IMAGE/JPEG", null)).toBe("image/jpeg");
    expect(sanitizeMimeType("image/gif", "IMAGE/PNG")).toBe("image/png");
  });

  it("handles empty detected string like null", () => {
    expect(sanitizeMimeType("image/webp", "")).toBe("image/webp");
  });

  it("rejects when no supported type is provided", () => {
    expect(() => sanitizeMimeType("", null)).toThrow("Unsupported MIME type");
  });
});
