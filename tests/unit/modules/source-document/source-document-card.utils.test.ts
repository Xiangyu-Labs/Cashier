import { describe, expect, it } from "vitest";

import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import {
  buildSourceDocumentCardTotals,
  getSourceDocumentPreview,
  sortSourceDocumentEntries,
} from "@/modules/source-document/ui/source-document-card.utils";

const defaultCategory: EntryCategory = {
  id: "cat-food",
  ledgerId: "ledger-1",
  name: "餐饮",
  description: null,
  icon: "Utensils",
  sortOrder: 1,
  isEditable: true,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

function createSourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "测试单据",
    text: "原始文本",
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2024-01-01",
    metadata: {},
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    deletedAt: null,
    hasImages: false,
    supportedActions: ["retry", "edit_retry", "delete"],
    errorCode: null,
    ...overrides,
  };
}

function createSourceDocumentLight(
  overrides: Partial<SourceDocumentLight> = {}
): SourceDocumentLight {
  return {
    id: "doc-light-1",
    ledgerId: "ledger-1",
    title: "轻量单据",
    text: "轻量文本",
    files: [],
    status: "processing",
    type: "manual",
    anomalyReason: null,
    entryDate: "2024-01-01",
    createdAt: "2024-01-01",
    hasImages: false,
    supportedActions: ["delete"],
    errorCode: null,
    ...overrides,
  };
}

function createEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: defaultCategory.id,
    category: defaultCategory,
    itemName: "默认条目",
    amount: "12.00",
    currency: "CNY",
    convertedAmount: null,
    exchangeRate: null,
    description: null,
    sourceDocumentId: "doc-1",
    sourceDocument: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    deletedAt: null,
    ...overrides,
  };
}

describe("source-document-card utils", () => {
  it("sorts entries by category sortOrder and then amount descending", () => {
    const [first, second, third] = sortSourceDocumentEntries([
      createEntry({
        id: "b",
        itemName: "B",
        amount: "12.00",
        category: { ...defaultCategory, id: "cat-b", sortOrder: 3 },
        categoryId: "cat-b",
      }),
      createEntry({
        id: "a",
        itemName: "A",
        amount: "88.00",
        category: { ...defaultCategory, id: "cat-a", sortOrder: 1 },
        categoryId: "cat-a",
      }),
      createEntry({
        id: "c",
        itemName: "C",
        amount: "50.00",
        category: { ...defaultCategory, id: "cat-c", sortOrder: 1 },
        categoryId: "cat-c",
      }),
    ]);

    expect([first?.id, second?.id, third?.id]).toEqual(["a", "c", "b"]);
  });

  it("normalizes preview text and image arrays from a source document", () => {
    expect(
      getSourceDocumentPreview(
        createSourceDocumentLight({
          text: null,
          hasImages: true,
        })
      )
    ).toEqual({
      text: "",
      images: [],
    });

    expect(
      getSourceDocumentPreview(
        createSourceDocument({
          text: "OCR preview",
          files: [
            { id: "file-a", contentType: "image/jpeg", byteSize: 10, originalFilename: null },
            { id: "file-b", contentType: "image/png", byteSize: 20, originalFilename: null },
          ],
        })
      )
    ).toEqual({
      text: "OCR preview",
      images: [
        { id: "file-a", contentType: "image/jpeg", byteSize: 10, originalFilename: null },
        { id: "file-b", contentType: "image/png", byteSize: 20, originalFilename: null },
      ],
    });
  });

  it("builds totals with converted amounts and falls back to main-currency entry amounts", () => {
    const totals = buildSourceDocumentCardTotals(
      [
        createEntry({
          id: "usd-entry",
          amount: "10.00",
          currency: "USD",
          convertedAmount: "70.00",
        }),
        createEntry({
          id: "cny-entry",
          amount: "20.00",
          currency: "CNY",
          convertedAmount: null,
        }),
      ],
      "CNY"
    );

    expect(totals.subtotalsByCurrency).toEqual({
      USD: 10,
      CNY: 20,
    });
    expect(totals.totalInMainCurrency).toBe(90);
    expect(totals.breakdownData).toEqual([
      {
        currency: "USD",
        amount: 10,
        convertedAmount: 70,
      },
      {
        currency: "CNY",
        amount: 20,
        convertedAmount: 20,
      },
    ]);
  });
});
