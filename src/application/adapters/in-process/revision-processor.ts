import { and, asc, eq, isNull } from "drizzle-orm";
import type {
  RevisionProcessingRequestContract,
  RevisionProcessingResultContract,
  RevisionProcessorPort,
} from "@/application/contracts";
import {
  sqliteLedgerProjectionAdapter,
  sqliteRevisionAdapter,
} from "@/application/adapters/sqlite";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { AIContext } from "@/lib/tasks/types";
import {
  entryCategories,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { getLedgerMainCurrency } from "@/modules/ledger/source-document-queries";
import {
  buildEntriesForInsert,
  getEntryFallbackDate,
  validateEntries,
} from "@/modules/source-document/application/parse-source-document/entry-builder";
import {
  buildStageContext,
  runParsePipeline,
} from "@/modules/source-document/application/parse-source-document/pipeline";
import { toParseSourceDocumentOutput } from "@/modules/source-document/application/parse-source-document/result-mapper";

export interface CurrentRevisionProcessorOptions {
  createAIContext: (signal: AbortSignal) => AIContext;
}

export class CurrentRevisionProcessor implements RevisionProcessorPort {
  constructor(private readonly options: CurrentRevisionProcessorOptions) {}

  async process(
    request: RevisionProcessingRequestContract
  ): Promise<RevisionProcessingResultContract> {
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: and(
        eq(sourceDocumentRevisions.ledgerId, request.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, request.sourceDocumentId),
        eq(sourceDocumentRevisions.id, request.revisionId)
      ),
    });
    const document = await db.query.sourceDocuments.findFirst({
      where: and(
        eq(sourceDocuments.ledgerId, request.ledgerId),
        eq(sourceDocuments.id, request.sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      ),
    });
    if (revision == null || document == null) throw new NotFoundError("Pending revision");
    if (document.activeRevisionId === request.revisionId && revision.outcome === "completed") {
      return { outcome: "completed" };
    }
    if (document.pendingRevisionId !== request.revisionId) {
      throw new Error("Revision processing request is stale");
    }

    const [files, categories] = await Promise.all([
      db
        .select({ id: revisionFiles.storedFileId })
        .from(revisionFiles)
        .where(eq(revisionFiles.revisionId, request.revisionId))
        .orderBy(asc(revisionFiles.position)),
      db
        .select({
          id: entryCategories.id,
          name: entryCategories.name,
          description: entryCategories.description,
        })
        .from(entryCategories)
        .where(
          and(eq(entryCategories.ledgerId, request.ledgerId), isNull(entryCategories.deletedAt))
        )
        .orderBy(
          asc(entryCategories.sortOrder),
          asc(entryCategories.createdAt),
          asc(entryCategories.id)
        ),
    ]);
    const controller = new AbortController();
    const pipeline = await runParsePipeline(
      {
        ledgerId: request.ledgerId,
        sourceDocumentId: request.sourceDocumentId,
        ...(revision.submittedText == null ? {} : { text: revision.submittedText }),
        ...(files.length === 0 ? {} : { storedFileIds: files.map((file) => file.id) }),
        categories,
        settings: {},
      },
      buildStageContext({
        signal: controller.signal,
        ai: this.options.createAIContext(controller.signal),
        setProgress: async () => {},
        docId: request.revisionId,
        ledgerId: request.ledgerId,
      })
    );
    const output = toParseSourceDocumentOutput(pipeline);
    if (output.verificationStatus !== "passed") {
      const anomalyReason =
        output.anomalyReason ??
        (output.verificationStatus === "invalid" ? "Invalid content" : "Parsing results diverged");
      await sqliteRevisionAdapter.preserveTerminalOutcome({
        ...request,
        outcome: "anomaly",
        anomalyReason,
      });
      return { outcome: "anomaly", anomalyReason };
    }

    const validation = validateEntries(output.ledgerEntries);
    if (!validation.isValid) {
      const anomalyReason = validation.reason ?? "No valid entries";
      await sqliteRevisionAdapter.preserveTerminalOutcome({
        ...request,
        outcome: "anomaly",
        anomalyReason,
      });
      return { outcome: "anomaly", anomalyReason };
    }
    const mainCurrency = await getLedgerMainCurrency(request.ledgerId);
    const { fallbackDate } = getEntryFallbackDate(document.entryDate);
    const entries = await buildEntriesForInsert({
      validEntries: output.ledgerEntries.filter(
        (entry) => entry.amount > 0 || entry.isAdjustment === true
      ),
      categories,
      sourceDocumentId: request.sourceDocumentId,
      ledgerId: request.ledgerId,
      mainCurrency,
      fallbackDate,
    });
    const activated = await sqliteLedgerProjectionAdapter.activateRevision({
      ...request,
      ...(output.title == null ? {} : { title: output.title }),
      entries: entries.map((entry) => ({
        categoryId: entry.categoryId,
        amount: entry.amount,
        currency: entry.currency,
        itemName: entry.itemName,
        description: entry.description,
        convertedAmount: entry.convertedAmount,
        exchangeRate: entry.exchangeRate,
        createdAt: entry.entryDate,
      })),
    });
    if (!activated) {
      const current = await sqliteRevisionAdapter.get(request.ledgerId, request.sourceDocumentId);
      if (current?.activeRevisionId !== request.revisionId) {
        throw new Error("Revision completion is stale");
      }
    }
    return { outcome: "completed" };
  }
}
