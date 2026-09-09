import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "@/lib/utils";

describe("copyToClipboard", () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies non-empty text with the browser clipboard", async () => {
    await expect(copyToClipboard("Hello World")).resolves.toBe(true);
    expect(clipboardWriteText).toHaveBeenCalledWith("Hello World");
    await expect(copyToClipboard("")).resolves.toBe(false);
  });

  it("falls back to the legacy browser operation when clipboard access fails", async () => {
    clipboardWriteText.mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(true);

    await expect(copyToClipboard("fallback text")).resolves.toBe(true);
    expect(document.body.querySelector("textarea")).toBeNull();
  });

  it("reports failure and cleans up when the legacy browser operation fails", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false });
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyToClipboard("uncopied text")).resolves.toBe(false);
    expect(document.body.querySelector("textarea")).toBeNull();
  });
});
