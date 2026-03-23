import { describe, expect, it } from "vitest";
import { generateSourceDocumentNextCursor } from "@/modules/source-document/application/queries/source-document-query-cursor";

describe("source-document-query-cursor", () => {
  it("generates the next cursor from entryDate, createdAt, and id", () => {
    const cursor = generateSourceDocumentNextCursor({
      id: "doc-1",
      entryDate: "2026-03-23",
      createdAt: new Date("2026-03-23T10:00:00.000Z"),
    } as never);

    expect(cursor).toBe("2026-03-23|2026-03-23T10:00:00.000Z|doc-1");
  });
});
