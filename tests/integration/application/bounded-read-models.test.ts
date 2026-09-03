import { describe, expect, it } from "vitest";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { listLedgerEntries as listLedgerEntriesUseCase } from "@/modules/ledger/application/queries/list-ledger-entries";
import { serverComposition } from "@/application/server-composition-root";
import { getSourceDocumentFullQuery as getSourceDocumentFullQueryUseCase } from "@/modules/source-document/application/queries/get-source-document-full";
import { listStreamPage as listStreamPageUseCase } from "@/modules/source-document/application/queries/list-stream-page";
import { sourceDocuments } from "@/persistence";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
} from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

const listLedgerEntries = (
  ledgerId: string,
  input: Parameters<typeof listLedgerEntriesUseCase>[1]
) => listLedgerEntriesUseCase(ledgerId, input, serverComposition.ledgerReads);
const queryPorts = {
  documents: serverComposition.sourceDocumentReads,
  ledgerReads: serverComposition.ledgerReads,
};
const listStreamPage = (ledgerId: string, input: Parameters<typeof listStreamPageUseCase>[1]) =>
  listStreamPageUseCase(ledgerId, input, queryPorts);
const getSourceDocumentFullQuery = (ledgerId: string, sourceDocumentId: string) =>
  getSourceDocumentFullQueryUseCase(ledgerId, sourceDocumentId, queryPorts.documents);

const SOURCE_LIST_KEYS = [
  "anomalyReason",
  "createdAt",
  "deletedAt",
  "entryDate",
  "errorCode",
  "files",
  "hasImages",
  "id",
  "ledgerEntries",
  "ledgerId",
  "metadata",
  "pendingRevisionId",
  "status",
  "supportedActions",
  "text",
  "title",
  "type",
  "updatedAt",
];

const LEDGER_LIST_KEYS = [
  "amount",
  "categoryId",
  "convertedAmount",
  "createdAt",
  "currency",
  "deletedAt",
  "description",
  "exchangeRate",
  "id",
  "itemName",
  "ledgerId",
  "sourceDocument",
  "sourceDocumentId",
  "updatedAt",
];

async function collectSourceDocumentPages(ledgerId: string, limit: number) {
  const items = [];
  let cursor: string | null = null;
  const pageSizes: number[] = [];
  do {
    const page = await listStreamPage(ledgerId, { limit, cursor });
    items.push(...page.items);
    pageSizes.push(page.items.length);
    cursor = page.nextCursor;
  } while (cursor != null);
  return { items, pageSizes };
}

async function collectLedgerEntryPages(ledgerId: string, limit: number) {
  const items = [];
  let cursor: string | null = null;
  const pageSizes: number[] = [];
  do {
    const page = await listLedgerEntries(ledgerId, { limit, cursor: cursor ?? undefined });
    items.push(...page.items);
    pageSizes.push(page.items.length);
    cursor = page.nextCursor;
  } while (cursor != null);
  return { items, pageSizes };
}

describe("bounded target read models", () => {
  it("paginates a large source-document history with a bounded list DTO", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const historySize = 31;
    const sensitiveText = "full-source-text-that-must-not-enter-history";
    const sensitiveUrl = "/api/uploads/private/history-receipt.jpg";
    const localPath = "/var/lib/cashier/uploads/private/history-receipt.jpg";
    const storageKey = "private/history-receipt.jpg";
    const createdAt = new Date("2026-07-15T08:00:00.000Z");
    const documents = await db
      .insert(sourceDocuments)
      .values(
        Array.from({ length: historySize }, (_, index) => ({
          ledgerId,
          title: `Receipt ${index}`,
          currentStatus: "completed" as const,
          entryDate: "2026-07-15",
          createdAt,
          updatedAt: createdAt,
        }))
      )
      .returning();
    for (const [index, document] of documents.entries()) {
      await activateTestSourceDocumentProjection(db, document.id, {
        text: `${sensitiveText}-${index}`,
        imageUrls: [`${sensitiveUrl}/${index}`],
      });
    }

    const firstPage = await listStreamPage(ledgerId, { limit: 7 });
    const history = await collectSourceDocumentPages(ledgerId, 7);
    const serialized = JSON.stringify(firstPage);

    expect(history.items).toHaveLength(historySize);
    expect(new Set(history.items.map((item) => item.id))).toHaveLength(historySize);
    expect(history.pageSizes).toEqual([7, 7, 7, 7, 3]);
    expect(firstPage.items.every((item) => item.text === null && item.files.length === 0)).toBe(
      true
    );
    expect(Object.keys(firstPage.items[0]!).sort()).toEqual([...SOURCE_LIST_KEYS].sort());
    expect(serialized.length).toBeLessThan(10_000);
    for (const forbidden of [
      sensitiveText,
      sensitiveUrl,
      storageKey,
      localPath,
      "sourceDocumentRevisionId",
      "revisionNumber",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const detail = await getSourceDocumentFullQuery(ledgerId, documents[0]!.id);
    expect(Object.keys(detail).sort()).toEqual(
      ["createdAt", "files", "id", "status", "text"].sort()
    );
    expect(detail.text).toBe(`${sensitiveText}-0`);
    expect(detail.files).toEqual([
      {
        id: expect.any(String),
        contentType: "image/jpeg",
        byteSize: 1,
        originalFilename: null,
      },
    ]);
    expect(JSON.stringify(detail)).not.toContain(sensitiveUrl);
    expect(JSON.stringify(detail)).not.toContain(storageKey);
    expect(JSON.stringify(detail)).not.toContain(localPath);
  });

  it("paginates a large ledger history without leaking source evidence or internal revisions", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const historySize = 31;
    const sensitiveText = "full-ledger-source-text-that-must-not-enter-list";
    const sensitiveUrl = "/api/uploads/private/ledger-receipt.jpg";
    const localPath = "/var/lib/cashier/uploads/private/ledger-receipt.jpg";
    const storageKey = "private/ledger-receipt.jpg";
    const createdAt = "2026-07-15T08:00:00.000Z";
    const created = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
      ledgerId,
      title: "Large receipt",
      submittedText: sensitiveText,
      entryDate: "2026-07-15",
      entries: Array.from({ length: historySize }, (_, index) => ({
        id: crypto.randomUUID(),
        categoryId: null,
        amount: `${index + 1}.25`,
        currency: "CNY",
        itemName: `Item ${index}`,
        description: null,
        convertedAmount: `${index + 1}.25`,
        exchangeRate: "1.000000",
        createdAt,
      })),
    });
    const firstPage = await listLedgerEntries(ledgerId, { limit: 7 });
    const history = await collectLedgerEntryPages(ledgerId, 7);
    const serialized = JSON.stringify(firstPage);

    expect(history.items).toHaveLength(historySize);
    expect(new Set(history.items.map((item) => item.id))).toHaveLength(historySize);
    expect(history.pageSizes).toEqual([7, 7, 7, 7, 3]);
    expect(Object.keys(firstPage.items[0]!).sort()).toEqual([...LEDGER_LIST_KEYS].sort());
    expect(firstPage.items[0]?.sourceDocument).toMatchObject({
      id: created.sourceDocumentId,
      hasImages: false,
    });
    expect(serialized.length).toBeLessThan(15_000);
    for (const forbidden of [
      sensitiveText,
      sensitiveUrl,
      storageKey,
      localPath,
      "sourceDocumentRevisionId",
      "activeRevisionId",
      "pendingRevisionId",
      "revisionNumber",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
