import { describe, expect, it } from "vitest";
import { determineSourceType, type SourceDocumentInput } from "@/lib/ai/types";

describe("determineSourceType", () => {
  it("selects the parser input mode from user-provided evidence", () => {
    const image = { data: "base64", mimeType: "image/jpeg" };
    const cases: Array<[SourceDocumentInput, string]> = [
      [{}, "text"],
      [{ text: "note" }, "text"],
      [{ images: [image] }, "image"],
      [{ text: "note", images: [image] }, "mixed"],
    ];

    for (const [input, expected] of cases) {
      expect(determineSourceType(input)).toBe(expected);
    }
  });
});
