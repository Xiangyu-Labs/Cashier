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
  "entryDate",
  "errorCode",
  "hasImages",
  "id",
  "ledgerEntries",
  "ledgerId",
  "pendingRevisionId",
  "status",
  "supportedActions",
  "text",
  "title",
  "type",
  "updatedAt",
];

function normalizeSql(statement: string): string {
  return statement.toLowerCase().replace(/\s+/g, " ").trim();
}

async function captureSqlStatements<T>(fn: () => Promise<T>) {
  const dbWithClient = getTestDb() as unknown as {
    $client?: {
      query: (query: string | { text?: string }, ...args: unknown[]) => Promise<unknown>;
      connect: (...args: unknown[]) => Promise<{
        query: (query: string | { text?: string }, ...args: unknown[]) => Promise<unknown>;
        release: (...args: unknown[]) => void;
      }>;
    };
  };
  const client = dbWithClient.$client;
  if (client == null) throw new Error("Expected drizzle client to exist in integration tests");
  const originalQuery = client.query.bind(client);
  const originalConnect = client.connect.bind(client);
  const statements: string[] = [];
  const record = (query: string | { text?: string }) => {
    statements.push(typeof query === "string" ? query : (query.text ?? ""));
  };
  client.query = ((query: string | { text?: string }, ...args: unknown[]) => {
    record(query);
    return originalQuery(query, ...args);
  }) as typeof client.query;
  client.connect = (async (...args: unknown[]) => {
    const connection = await originalConnect(...args);
    const connectionQuery = connection.query.bind(connection);
    const connectionRelease = connection.release.bind(connection);
    connection.query = ((query: string | { text?: string }, ...queryArgs: unknown[]) => {
      record(query);
      return connectionQuery(query, ...queryArgs);
    }) as typeof connection.query;
    connection.release = ((...releaseArgs: unknown[]) => {
      connection.query = connectionQuery;
      connection.release = connectionRelease;
      connectionRelease(...releaseArgs);
    }) as typeof connection.release;
    return connection;
  }) as typeof client.connect;
  try {
    const result = await fn();
    return { result, statements };
  } finally {
    client.query = originalQuery;
    client.connect = originalConnect;
  }
}

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
  it("uses exactly two read statements at the source-document read adapter boundary", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [document] = await db
      .insert(sourceDocuments)
      .values({ ledgerId, currentStatus: "completed", entryDate: "2026-09-03" })
      .returning();
    await activateTestSourceDocumentProjection(db, document!.id, {
      text: "bounded evidence",
      imageUrls: ["/api/uploads/bounded.jpg"],
    });

    const listCapture = await captureSqlStatements(() =>
      serverComposition.sourceDocumentReads.list({ ledgerId, limit: 20 })
    );
    const detailCapture = await captureSqlStatements(() =>
      serverComposition.sourceDocumentReads.get(ledgerId, document!.id)
    );
    const readStatements = (statements: string[]) =>
      statements.map(normalizeSql).filter((statement) => /^(select|with)\b/.test(statement));

    expect(listCapture.result.items).toHaveLength(1);
    expect(detailCapture.result?.files).toHaveLength(1);
    expect(detailCapture.result?.ledgerEntries).toEqual([]);
    expect(readStatements(listCapture.statements)).toHaveLength(2);
    expect(readStatements(detailCapture.statements)).toHaveLength(2);
  });

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
    expect(firstPage.items.every((item) => item.text === null)).toBe(true);
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
