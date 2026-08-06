import { and, asc, eq, isNull } from "drizzle-orm";
import type {
  RevisionProcessingRequestContract,
  RevisionProcessingResultContract,
  RevisionProcessorPort,
} from "@/application/contracts";
import {
  postgresLedgerProjectionAdapter,
  storeCandidateRevision,
} from "@/application/adapters/postgres/ledger-projections";
import { storeDuplicatePendingRevision } from "@/application/adapters/postgres/ledger-projections";
import { listDuplicateDetectionCandidates } from "@/application/adapters/postgres/duplicate-candidates";
import { postgresRevisionAdapter } from "@/application/adapters/postgres/revisions";
import { postgresSettingsAdapter } from "@/application/adapters/postgres/business-ports";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { AIContext } from "@/lib/tasks/types";
import {
  duplicateReviews,
  entryCategories,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { compare, divide, round } from "@/lib/money/decimal";
import { postgresFxRateBook } from "@/application/adapters/postgres/exchange-rate";
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
import {
  ProcessingCancelledError,
  ProcessingFailure,
  throwIfProcessingCancelled,
} from "@/modules/source-document/application/parse-source-document/contracts";
import { detectDuplicateBill } from "@/modules/source-document/application/duplicate-detection";
import {
  isFailedLoadImageResult,
  isSuccessfulLoadImageResult,
  loadStoredFilesForAI,
} from "@/lib/storage/utils";

export interface CurrentRevisionProcessorOptions {
  createAIContext: (signal: AbortSignal) => AIContext;
}

export class CurrentRevisionProcessor implements RevisionProcessorPort {
  constructor(private readonly options: CurrentRevisionProcessorOptions) {}

  async process(
    request: RevisionProcessingRequestContract
  ): Promise<RevisionProcessingResultContract> {
    const signal = request.signal ?? AbortSignal.any([]);
    throwIfProcessingCancelled(signal);
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
    throwIfProcessingCancelled(signal);

    // Load current ledger settings for parser input
    const ledgerSettings = await postgresSettingsAdapter.get(request.ledgerId);

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
    throwIfProcessingCancelled(signal);
    const loadedEvidence = await loadStoredFilesForAI(
      request.ledgerId,
      files.map((file) => file.id)
    );
    throwIfProcessingCancelled(signal);
    const failedEvidence = loadedEvidence.filter(isFailedLoadImageResult);
    if (failedEvidence.length > 0) {
      throw new ProcessingFailure(
        "storage_failure",
        `Failed to load ${failedEvidence.length} source document evidence file(s)`,
        { cause: failedEvidence[0]?.error }
      );
    }
    const evidence = loadedEvidence.filter(isSuccessfulLoadImageResult);
    const ai = this.options.createAIContext(signal);
    const pipeline = await runParsePipeline(
      {
        ...(revision.submittedText == null ? {} : { text: revision.submittedText }),
        ...(evidence.length === 0
          ? {}
          : { evidence: { images: evidence.map((item) => ({ dataUrl: item.dataUrl })) } }),
        categories,
        ...(ledgerSettings?.aiCustomPrompt !== undefined
          ? { settings: { aiCustomPrompt: ledgerSettings.aiCustomPrompt } }
          : { settings: {} }),
        ...(ledgerSettings?.aiLanguage !== undefined
          ? { aiLanguage: ledgerSettings.aiLanguage }
          : {}),
        ...(ledgerSettings?.currencies !== undefined
          ? { preferredCurrencies: ledgerSettings.currencies }
          : {}),
      },
      buildStageContext({
        signal,
        ai,
        setProgress: async () => {},
        docId: request.revisionId,
        ledgerId: request.ledgerId,
      })
    );
    throwIfProcessingCancelled(signal);
    const output = toParseSourceDocumentOutput(pipeline);
    if (output.verificationStatus !== "passed") {
      const anomalyReason =
        output.anomalyReason ??
        (output.verificationStatus === "invalid" ? "Invalid content" : "Parsing results diverged");
      const preserved = await postgresRevisionAdapter.preserveTerminalOutcome({
        ...request,
        ...(request.lease == null ? {} : { lease: request.lease }),
        outcome: "anomaly",
        anomalyReason,
      });
      if (!preserved && request.lease != null) {
        throw new ProcessingCancelledError();
      }
      return { outcome: "anomaly", anomalyReason };
    }

    const validation = validateEntries(output.ledgerEntries);
    throwIfProcessingCancelled(signal);
    if (!validation.isValid) {
      const anomalyReason = validation.reason ?? "No valid entries";
      const preserved = await postgresRevisionAdapter.preserveTerminalOutcome({
        ...request,
        ...(request.lease == null ? {} : { lease: request.lease }),
        outcome: "anomaly",
        anomalyReason,
      });
      if (!preserved && request.lease != null) {
        throw new ProcessingCancelledError();
      }
      return { outcome: "anomaly", anomalyReason };
    }
    const mainCurrency = ledgerSettings?.mainCurrency ?? "CNY";
    const { fallbackDate } = getEntryFallbackDate(document.entryDate);
    const entries = await buildEntriesForInsert({
      validEntries: output.ledgerEntries.filter(
        (entry) => compare(entry.amount, "0") > 0 || entry.isAdjustment === true
      ),
      categories,
      sourceDocumentId: request.sourceDocumentId,
      ledgerId: request.ledgerId,
      mainCurrency,
      fallbackDate,
      convertAmount: async ({ amount, fromCurrency, toCurrency, date }) => {
        const convertedAmount = await postgresFxRateBook.convert(
          amount,
          fromCurrency,
          toCurrency,
          date
        );
        return {
          convertedAmount: round(convertedAmount, 2),
          exchangeRate: round(divide(convertedAmount, amount), 6),
        };
      },
    });
    throwIfProcessingCancelled(signal);
    const entryInputs = entries.map((entry) => ({
      categoryId: entry.categoryId,
      amount: entry.amount,
      currency: entry.currency,
      itemName: entry.itemName,
      description: entry.description,
      convertedAmount: entry.convertedAmount,
      exchangeRate: entry.exchangeRate,
      createdAt: entry.entryDate,
    }));

    if (
      document.activeRevisionId == null &&
      document.type === "ai_parsed" &&
      ledgerSettings?.duplicateDetectionEnabled !== false
    ) {
      // Retries/re-parses after a duplicate flag are never re-checked: a prior
      // review (pending or retired) marks this document as already judged.
      const priorReview = await db.query.duplicateReviews.findFirst({
        where: and(
          eq(duplicateReviews.ledgerId, request.ledgerId),
          eq(duplicateReviews.sourceDocumentId, request.sourceDocumentId)
        ),
        columns: { id: true },
      });
      const detection =
        document.entryDate == null || priorReview != null
          ? null
          : await detectDuplicateBill({
              ledgerId: request.ledgerId,
              mainCurrency,
              ...(ledgerSettings?.aiLanguage === undefined
                ? {}
                : { aiLanguage: ledgerSettings.aiLanguage }),
              ...(ledgerSettings?.aiCustomPrompt === undefined
                ? {}
                : { aiCustomPrompt: ledgerSettings.aiCustomPrompt }),
              sourceDocumentId: request.sourceDocumentId,
              currentCreatedAt: document.createdAt.toISOString(),
              currentTitle: output.title ?? null,
              currentEntries: entryInputs,
              currentStoredFileIds: files.map((file) => file.id),
              candidates: await listDuplicateDetectionCandidates(
                request.ledgerId,
                document.entryDate,
                request.sourceDocumentId
              ),
              loadImages: async (storedFileIds) => {
                const loaded = await loadStoredFilesForAI(request.ledgerId, [...storedFileIds]);
                return loaded
                  .filter(isSuccessfulLoadImageResult)
                  .map((item) => ({ url: item.url, dataUrl: item.dataUrl }));
              },
              ai,
              signal,
            });
      throwIfProcessingCancelled(signal);
      if (detection?.duplicate === true && detection.matchedSourceDocumentId != null) {
        throwIfProcessingCancelled(signal);
        const stored = await storeDuplicatePendingRevision(
          request.ledgerId,
          request.sourceDocumentId,
          request.revisionId,
          output.title,
          entryInputs,
          {
            matchedSourceDocumentId: detection.matchedSourceDocumentId,
            reason: detection.reason,
            confidence: detection.confidence,
          },
          request.lease
        );
        if (!stored) {
          if (request.lease != null) throw new ProcessingCancelledError();
          throw new Error("Failed to store duplicate pending revision");
        }
        return { outcome: "completed" };
      }
    }

    if (document.activeRevisionId == null) {
      // First parse: activate revision (replace projection, update pointers)
      throwIfProcessingCancelled(signal);
      const activated = await postgresLedgerProjectionAdapter.activateRevision({
        ...request,
        ...(request.lease == null ? {} : { lease: request.lease }),
        ...(output.title == null ? {} : { title: output.title }),
        entries: entryInputs,
      });
      if (!activated) {
        if (request.lease != null) throw new ProcessingCancelledError();
        const current = await postgresRevisionAdapter.get(
          request.ledgerId,
          request.sourceDocumentId
        );
        if (current?.activeRevisionId !== request.revisionId) {
          throw new Error("Revision completion is stale");
        }
      }
    } else {
      // Document already has an active projection -> store as candidate revision
      throwIfProcessingCancelled(signal);
      const stored = await storeCandidateRevision(
        request.ledgerId,
        request.sourceDocumentId,
        request.revisionId,
        output.title,
        entryInputs,
        request.lease
      );
      if (!stored) {
        if (request.lease != null) throw new ProcessingCancelledError();
        throw new Error("Failed to store candidate revision");
      }
    }
    return { outcome: "completed" };
  }
}
