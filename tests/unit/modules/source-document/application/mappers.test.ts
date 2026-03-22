import { describe, expect, it } from "vitest";
import {
  mapSourceDocumentLedgerEntryDto,
  mapSourceDocumentListItemDto,
} from "../../../../../src/modules/source-document/application/mappers";

describe("mapSourceDocumentLedgerEntryDto", () => {
  it("omits category when the relation is absent", () => {
    const dto = mapSourceDocumentLedgerEntryDto({
      id: "entry-1",
      ledgerId: "ledger-1",
      categoryId: null,
      sourceDocumentId: "doc-1",
      amount: "10.00",
      currency: "USD",
      itemName: "Coffee",
      description: null,
      convertedAmount: null,
      exchangeRate: null,
      createdAt: "2026-03-19T12:00:00.000Z",
      updatedAt: "2026-03-19T12:00:00.000Z",
      deletedAt: null,
    });

    expect("category" in dto).toBe(false);
  });
});

describe("mapSourceDocumentListItemDto", () => {
  it("returns an explicit list payload without trimmed detail fields leaking through", () => {
    const dto = mapSourceDocumentListItemDto(
      {
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
      } as never,
      [{ id: "entry-1" } as never]
    );

    expect(dto).toMatchObject({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "Receipt",
      text: null,
      imageUrls: [],
      status: "completed",
      type: "ai_parsed",
      metadata: {},
      hasImages: true,
    });
    expect(dto.createdAt).toBe("2026-03-19T12:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-03-19T12:30:00.000Z");
    expect(dto.ledgerEntries).toHaveLength(1);
  });
});
