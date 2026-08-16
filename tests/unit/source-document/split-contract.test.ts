import { describe, expect, it } from "vitest";
import { splitSourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";

function validInput() {
  return {
    sourceDocumentId: crypto.randomUUID(),
    expectedRevisionId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    newSourceDocumentId: crypto.randomUUID(),
    ledgerEntryIds: [crypto.randomUUID()],
    entryDate: "2026-08-16",
  };
}

describe("splitSourceDocumentInputSchema", () => {
  it("accepts a strict split request", () => {
    expect(splitSourceDocumentInputSchema.parse(validInput())).toMatchObject({
      entryDate: "2026-08-16",
    });
  });

  it("rejects empty and duplicate entry IDs", () => {
    expect(() =>
      splitSourceDocumentInputSchema.parse({ ...validInput(), ledgerEntryIds: [] })
    ).toThrow();
    const entryId = crypto.randomUUID();
    expect(() =>
      splitSourceDocumentInputSchema.parse({
        ...validInput(),
        ledgerEntryIds: [entryId, entryId],
      })
    ).toThrow();
  });

  it("rejects invalid dates, non-v4 IDs, and unknown fields", () => {
    expect(() =>
      splitSourceDocumentInputSchema.parse({ ...validInput(), entryDate: "2026-02-30" })
    ).toThrow();
    expect(() =>
      splitSourceDocumentInputSchema.parse({ ...validInput(), operationId: "not-a-uuid" })
    ).toThrow();
    expect(() => splitSourceDocumentInputSchema.parse({ ...validInput(), extra: true })).toThrow();
  });
});
