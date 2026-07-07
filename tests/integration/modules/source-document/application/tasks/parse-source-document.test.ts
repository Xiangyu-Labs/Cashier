import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as ParsePipelineModule from "@/modules/source-document/application/parse-source-document/pipeline";
const { runParsePipelineMock } = vi.hoisted(() => ({
  runParsePipelineMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/parse-source-document/pipeline", async (importOriginal) => {
  const actual = await importOriginal() as typeof ParsePipelineModule;
  return {
    ...actual,
    runParsePipeline: runParsePipelineMock,
  };
});

import {
  parseSourceDocumentHandler,
  type ParseSourceDocumentInput,
  type ParseSourceDocumentOutput,
} from "@/modules/source-document/application/tasks/parse-source-document";
import type { ParsePipelineResult } from "@/modules/source-document/application/parse-source-document/pipeline";
import { getTestDb } from "tests/setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { type TaskContext } from "@/lib/tasks";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";

describe("parseSourceDocumentHandler.execute", () => {
  let sourceDocId: string;
  let currentLedgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    runParsePipelineMock.mockReset();

    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger");
    currentLedgerId = ledgerId;
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        status: "queued",
      })
      .returning();

    expect(sourceDoc).toBeDefined();
    if (sourceDoc == null) {
      throw new Error("Expected source document to be created");
    }

    sourceDocId = sourceDoc.id;
  });

  it("should update status to processing and delegate execution", async () => {
    const db = getTestDb();
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [],
      settings: {},
    };
    const pipelineResult: ParsePipelineResult = {
      kind: "success",
      ledgerEntries: [],
      title: "Delegated",
      wasArbitrated: false,
    };
    runParsePipelineMock.mockResolvedValue(pipelineResult);

    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
      reportTokens: vi.fn(),
    } as unknown as TaskContext;

    const result = await parseSourceDocumentHandler.execute(input, context);

    const expectedOutput: ParseSourceDocumentOutput = {
      ledgerEntries: [],
      title: "Delegated",
      verificationStatus: "passed",
    };
    expect(result).toEqual(expectedOutput);
    expect(runParsePipelineMock).toHaveBeenCalledTimes(1);
    expect(runParsePipelineMock).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        docId: sourceDocId,
        ledgerId: currentLedgerId,
        signal: context.signal,
        ai: context.ai,
        setProgress: context.updateProgress,
      })
    );

    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocId),
    });
    expect(doc?.status).toBe("processing");
  });

  it("should throw when ledgerId is missing", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: "",
      sourceDocumentId: sourceDocId,
      categories: [],
      settings: {},
    };

    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
    } as unknown as TaskContext;

    await expect(parseSourceDocumentHandler.execute(input, context)).rejects.toThrow(
      "Missing ledgerId in task input"
    );
    expect(runParsePipelineMock).not.toHaveBeenCalled();
  });

  it("should throw when source document does not exist", async () => {
    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: "missing-source-doc",
      categories: [],
      settings: {},
    };

    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
    } as unknown as TaskContext;

    await expect(parseSourceDocumentHandler.execute(input, context)).rejects.toThrow(
      "Source document not found"
    );
    expect(runParsePipelineMock).not.toHaveBeenCalled();
  });
});

describe("parseSourceDocumentHandler.onComplete", () => {
  let sourceDocId: string;
  let categoryId: string;
  let currentLedgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = getTestDb();
    // Use random email to avoid unique constraint conflicts
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Complete Test Ledger");
    currentLedgerId = ledgerId;
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        status: "processing",
      })
      .returning();
    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "Food",
        description: "Food stuff",
      })
      .returning();

    expect(sourceDoc).toBeDefined();
    expect(category).toBeDefined();
    if (sourceDoc == null || category == null) {
      throw new Error("Expected source document and category to be created");
    }

    sourceDocId = sourceDoc.id;
    categoryId = category.id;
  });

  it(
    "should save ledger entries and update document status on success",
    { timeout: 60_000 },
    async () => {
      const db = getTestDb();

      const output: ParseSourceDocumentOutput = {
        ledgerEntries: [
          {
            itemName: "Lunch",
            amount: 10,
            currency: "USD",
            categoryIndex: 1,
            entryDate: "2024-01-01",
            notes: null,
          },
        ],
        title: "Test Title",
        verificationStatus: "passed",
      };

      const input: ParseSourceDocumentInput = {
        ledgerId: currentLedgerId,
        sourceDocumentId: sourceDocId,
        categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
        settings: {},
      };

      const context = {
        ledgerId: currentLedgerId,
      } as unknown as TaskContext;

      await parseSourceDocumentHandler.onComplete?.(output, input, context);

      // Check document status
      const doc = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, sourceDocId),
      });
      expect(doc?.status).toBe("completed");
      expect(doc?.title).toBe("Test Title");

      // Check ledger entries
      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(eq(ledgerEntries.sourceDocumentId, sourceDocId), isNull(ledgerEntries.deletedAt))
        );
      expect(entries).toHaveLength(1);
      const firstEntry = entries[0];
      expect(firstEntry).toBeDefined();
      if (firstEntry == null) {
        throw new Error("Expected saved ledger entry");
      }
      expect(firstEntry.itemName).toBe("Lunch");
    }
  );

  it("should set anomaly status when verificationStatus is anomaly", async () => {
    const db = getTestDb();

    const output: ParseSourceDocumentOutput = {
      ledgerEntries: [],
      anomalyReason: "Results inconsistent",
      verificationStatus: "anomaly",
    };

    const input: ParseSourceDocumentInput = {
      ledgerId: currentLedgerId,
      sourceDocumentId: sourceDocId,
      categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
      settings: {},
    };

    const context = {
      ledgerId: currentLedgerId,
    } as unknown as TaskContext;

    await parseSourceDocumentHandler.onComplete?.(output, input, context);

    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocId),
    });
    expect(doc?.status).toBe("anomaly");
    expect(doc?.anomalyReason).toBe("Results inconsistent");
  });
});
