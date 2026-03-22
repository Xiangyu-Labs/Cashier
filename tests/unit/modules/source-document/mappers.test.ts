import { describe, expect, it } from "vitest";
import { serializeSourceDocumentLight } from "../../../../src/modules/source-document/mappers";

describe("serializeSourceDocumentLight", () => {
  it("keeps light-detail semantics explicit without carrying image arrays", () => {
    const dto = serializeSourceDocumentLight({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "Receipt",
      text: "full text",
      imageUrls: ["https://example.com/1.png"],
      status: "completed",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: "2026-03-19",
      metadata: { vendor: "Cafe" },
      createdAt: new Date("2026-03-19T12:00:00.000Z"),
      updatedAt: new Date("2026-03-19T12:30:00.000Z"),
      deletedAt: null,
    } as never);

    expect(dto).toMatchObject({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "Receipt",
      text: "full text",
      status: "completed",
      type: "ai_parsed",
      metadata: { vendor: "Cafe" },
      hasImages: true,
    });
    expect("imageUrls" in dto).toBe(false);
  });
});
