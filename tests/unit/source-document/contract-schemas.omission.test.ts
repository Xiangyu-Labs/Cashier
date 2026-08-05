import { describe, expect, it } from "vitest";
import {
  createSourceDocumentInputSchema,
  createSourceDocumentInputSchemaV1,
  listSourceDocumentsInputSchema,
  retrySourceDocumentInputSchema,
} from "@/modules/source-document/contract-schemas";
import { MAX_FILES } from "@/modules/source-document/upload-policy";
import {
  ledgerStatsQuerySchema,
  listLedgerEntriesInputSchema,
} from "@/modules/ledger/contract-schemas";

describe("contract schema omission semantics", () => {
  it("omits undefined optional keys in source-document create/retry schemas", () => {
    const createParsed = createSourceDocumentInputSchema.parse({
      text: "Lunch 12.50",
      timezone: undefined,
    });
    const retryParsed = retrySourceDocumentInputSchema.parse({
      text: "Lunch 12.50",
      timezone: undefined,
    });

    expect(Object.prototype.hasOwnProperty.call(createParsed, "timezone")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(retryParsed, "timezone")).toBe(false);
  });

  it("omits undefined optional keys in source-document list schema", () => {
    const parsed = listSourceDocumentsInputSchema.parse({
      status: undefined,
      limit: "10",
    });

    expect(parsed.limit).toBe(10);
    expect(parsed.includeEntries).toBe(false);
    expect(parsed.includeFiles).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "status")).toBe(false);
  });

  it("allows the authenticated startup-preview snapshot reader to request file metadata", () => {
    const parsed = listSourceDocumentsInputSchema.parse({
      limit: 100,
      includeEntries: true,
      includeFiles: true,
    });
    expect(parsed).toMatchObject({ limit: 100, includeEntries: true, includeFiles: true });
  });

  it("keeps the API v1 Shortcut contract compact and normalizes ISO entry dates", () => {
    const parsed = createSourceDocumentInputSchemaV1.parse({
      images: [{ data: "AQ==\n", mimeType: "image/jpeg" }],
      entryDate: "2026-07-27T23:30:00+08:00",
    });
    expect(parsed.entryDate).toBe("2026-07-27");
    expect(parsed.images).toHaveLength(1);

    expect(() =>
      createSourceDocumentInputSchemaV1.parse({
        text: "removed from v1",
        images: [{ data: "AQ==", mimeType: "image/jpeg" }],
      })
    ).toThrow();
  });

  it("omits undefined optional keys in ledger list/stats schemas", () => {
    const listParsed = listLedgerEntriesInputSchema.parse({
      currency: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      limit: "5",
    });
    const statsParsed = ledgerStatsQuerySchema.parse({
      categoryId: undefined,
    });

    expect(listParsed.limit).toBe(5);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "minAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "maxAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(statsParsed, "categoryId")).toBe(false);
  });

  it("coerces ledger minAmount and maxAmount query values into numbers", () => {
    const parsed = listLedgerEntriesInputSchema.parse({
      minAmount: "20",
      maxAmount: "100",
      limit: "5",
    });

    expect(parsed.limit).toBe(5);
    expect(parsed.minAmount).toBe(20);
    expect(parsed.maxAmount).toBe(100);
  });

  it("rejects combined storedFileIds + images + originalImages exceeding MAX_FILES", () => {
    const uuid = () => crypto.randomUUID();

    // 10+0 success
    expect(() =>
      createSourceDocumentInputSchema.parse({
        storedFileIds: Array.from({ length: MAX_FILES }, () => uuid()),
      })
    ).not.toThrow();

    // 0+10 success
    expect(() =>
      createSourceDocumentInputSchema.parse({
        images: Array.from({ length: MAX_FILES }, () => ({
          data: "dGVzdA==",
          mimeType: "image/jpeg",
        })),
      })
    ).not.toThrow();

    // 1+2 success
    expect(() =>
      createSourceDocumentInputSchema.parse({
        storedFileIds: [uuid()],
        images: Array.from({ length: 2 }, () => ({
          data: "dGVzdA==",
          mimeType: "image/jpeg",
        })),
      })
    ).not.toThrow();

    // 10+1 failure (11 files)
    expect(() =>
      createSourceDocumentInputSchema.parse({
        storedFileIds: Array.from({ length: MAX_FILES }, () => uuid()),
        images: [{ data: "dGVzdA==", mimeType: "image/jpeg" }],
      })
    ).toThrow();

    // 6+5 failure (11 files)
    expect(() =>
      createSourceDocumentInputSchema.parse({
        storedFileIds: Array.from({ length: 6 }, () => uuid()),
        images: Array.from({ length: 5 }, () => ({
          data: "dGVzdA==",
          mimeType: "image/jpeg",
        })),
      })
    ).toThrow();

    // originalImages counted in total
    expect(() =>
      createSourceDocumentInputSchema.parse({
        storedFileIds: Array.from({ length: 5 }, () => uuid()),
        images: Array.from({ length: 3 }, () => ({
          data: "dGVzdA==",
          mimeType: "image/jpeg",
        })),
        originalImages: Array.from({ length: 3 }, () => ({
          data: "dGVzdA==",
          mimeType: "image/jpeg",
        })),
      })
    ).toThrow();
  });

  it("rejects blank ledger minAmount and maxAmount query values", () => {
    expect(() =>
      listLedgerEntriesInputSchema.parse({
        minAmount: "",
        limit: "5",
      })
    ).toThrow();

    expect(() =>
      listLedgerEntriesInputSchema.parse({
        maxAmount: "",
        limit: "5",
      })
    ).toThrow();
  });
});
