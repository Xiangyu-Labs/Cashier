import type {
  LedgerProjectionEntryContract,
  LedgerProjectionPort,
  RevisionProcessingRequestContract,
  RevisionProcessingContextContract,
  RevisionProcessingResultContract,
  RevisionProcessorPort,
  SettingsPort,
  SourceDocumentPort,
} from "@/application/contracts";
import { LedgerMainCurrencyChangedError } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import type { AIContext } from "@/lib/tasks/types";
import { compare } from "@/lib/money/decimal";
import { convertWithRates } from "@/modules/currency/application/services/rate-calculation";
import type { FxRateBook } from "@/modules/currency/application/ports";
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
  type LoadImageResult,
} from "./stored-image-loader";
import type { DuplicateCandidateContract } from "@/modules/source-document/application/duplicate-detection";

type DuplicateReviewSnapshot = {
  matchedSourceDocumentId: string;
  matchedRevisionId: string;
  matchedTitle: string | null;
  matchedEntryDate: string | null;
  matchedCreatedAt: string;
  reason: string | null;
  confidence: number | null;
};

export interface CurrentRevisionProcessorOptions {
  createAIContext: (signal: AbortSignal) => AIContext;
  loadContext: (
    request: RevisionProcessingRequestContract
  ) => Promise<RevisionProcessingContextContract>;
  getSettings: SettingsPort["get"];
  loadStoredFiles: (ledgerId: string, storedFileIds: string[]) => Promise<LoadImageResult[]>;
  listDuplicateCandidates: (
    ledgerId: string,
    entryDate: string,
    excludeSourceDocumentId: string
  ) => Promise<DuplicateCandidateContract[]>;
  getRates: FxRateBook["getRates"];
  preserveTerminalOutcome: SourceDocumentPort["preserveTerminalOutcome"];
  getRevision: SourceDocumentPort["get"];
  activateRevision: LedgerProjectionPort["activateRevision"];
  storeCandidateRevision: (
    ledgerId: string,
    sourceDocumentId: string,
    revisionId: string,
    expectedMainCurrency: string,
    title: string | null | undefined,
    entries: readonly LedgerProjectionEntryContract[],
    lease?: RevisionProcessingRequestContract["lease"],
    duplicateReview?: DuplicateReviewSnapshot
  ) => Promise<boolean>;
  storeDuplicatePendingRevision: (
    ledgerId: string,
    sourceDocumentId: string,
    revisionId: string,
    expectedMainCurrency: string,
    title: string | null | undefined,
    entries: readonly LedgerProjectionEntryContract[],
    review: DuplicateReviewSnapshot,
    lease?: RevisionProcessingRequestContract["lease"]
  ) => Promise<boolean>;
}

export class CurrentRevisionProcessor implements RevisionProcessorPort {
  constructor(private readonly options: CurrentRevisionProcessorOptions) {}

  async process(
    request: RevisionProcessingRequestContract
  ): Promise<RevisionProcessingResultContract> {
    const signal = request.signal ?? AbortSignal.any([]);
    throwIfProcessingCancelled(signal);
    const [context, ledgerSettings] = await Promise.all([
      this.options.loadContext(request),
      this.options.getSettings(request.ledgerId),
    ]);
    const { revision, document, storedFileIds, categories } = context;
    if (revision == null || document == null) throw new NotFoundError("Pending revision");
    if (document.activeRevisionId === request.revisionId && revision.outcome === "completed") {
      return { outcome: "completed" };
    }
    if (document.pendingRevisionId !== request.revisionId) {
      throw new Error("Revision processing request is stale");
    }
    throwIfProcessingCancelled(signal);

    throwIfProcessingCancelled(signal);
    const loadedEvidence = await this.options.loadStoredFiles(request.ledgerId, storedFileIds);
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
      const preserved = await this.options.preserveTerminalOutcome({
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
      const preserved = await this.options.preserveTerminalOutcome({
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
    const { fallbackDate } = getEntryFallbackDate(document.entryDate);
    const validEntries = output.ledgerEntries.filter(
      (entry) => compare(entry.amount, "0") > 0 || entry.isAdjustment === true
    );
    const ratesByDate = new Map<string, ReturnType<FxRateBook["getRates"]>>();
    let currentSettings = ledgerSettings;

    for (let attempt = 0; attempt < 3; attempt++) {
      throwIfProcessingCancelled(signal);
      if (attempt > 0) {
        currentSettings = await this.options.getSettings(request.ledgerId);
        throwIfProcessingCancelled(signal);
      }
      const mainCurrency = currentSettings?.mainCurrency ?? "CNY";

      try {
        const entries = await buildEntriesForInsert({
          validEntries,
          categories,
          sourceDocumentId: request.sourceDocumentId,
          ledgerId: request.ledgerId,
          mainCurrency,
          fallbackDate,
          convertAmount: async ({ amount, fromCurrency, toCurrency, date }) => {
            const rateDate = date ?? "latest";
            let ratesPromise = ratesByDate.get(rateDate);
            if (ratesPromise == null) {
              ratesPromise = this.options.getRates(date);
              ratesByDate.set(rateDate, ratesPromise);
            }
            return convertWithRates(amount, await ratesPromise, fromCurrency, toCurrency);
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
          document.type === "ai_parsed" &&
          currentSettings?.duplicateDetectionEnabled !== false &&
          document.entryDate != null
        ) {
          const candidates = await this.options.listDuplicateCandidates(
            request.ledgerId,
            document.entryDate,
            request.sourceDocumentId
          );
          const detection = await detectDuplicateBill({
            ledgerId: request.ledgerId,
            mainCurrency,
            ...(currentSettings?.aiLanguage === undefined
              ? {}
              : { aiLanguage: currentSettings.aiLanguage }),
            ...(currentSettings?.aiCustomPrompt === undefined
              ? {}
              : { aiCustomPrompt: currentSettings.aiCustomPrompt }),
            sourceDocumentId: request.sourceDocumentId,
            currentCreatedAt: document.createdAt.toISOString(),
            currentEntryDate: document.entryDate,
            currentTitle: output.title ?? null,
            currentEntries: entryInputs,
            currentStoredFileIds: storedFileIds,
            candidates,
            loadImages: async (candidateFileIds) => {
              const loaded = await this.options.loadStoredFiles(request.ledgerId, [
                ...candidateFileIds,
              ]);
              return loaded
                .filter(isSuccessfulLoadImageResult)
                .map((item) => ({ url: item.url, dataUrl: item.dataUrl }));
            },
            ai,
            signal,
          });
          throwIfProcessingCancelled(signal);
          if (
            detection?.duplicate === true &&
            detection.matchedSourceDocumentId != null &&
            detection.matchedRevisionId != null
          ) {
            const matchedCandidate = candidates.find(
              (candidate) => candidate.sourceDocumentId === detection.matchedSourceDocumentId
            );
            if (matchedCandidate != null) {
              const reviewSnapshot = {
                matchedSourceDocumentId: detection.matchedSourceDocumentId,
                matchedRevisionId: detection.matchedRevisionId,
                matchedTitle: matchedCandidate.title,
                matchedEntryDate: matchedCandidate.entryDate,
                matchedCreatedAt: matchedCandidate.createdAt,
                reason: detection.reason,
                confidence: detection.confidence,
              };
              if (document.activeRevisionId == null) {
                throwIfProcessingCancelled(signal);
                const stored = await this.options.storeDuplicatePendingRevision(
                  request.ledgerId,
                  request.sourceDocumentId,
                  request.revisionId,
                  mainCurrency,
                  output.title,
                  entryInputs,
                  reviewSnapshot,
                  request.lease
                );
                if (!stored) {
                  if (request.lease != null) throw new ProcessingCancelledError();
                  throw new Error("Failed to store duplicate pending revision");
                }
                return { outcome: "completed" };
              }
              throwIfProcessingCancelled(signal);
              const stored = await this.options.storeCandidateRevision(
                request.ledgerId,
                request.sourceDocumentId,
                request.revisionId,
                mainCurrency,
                output.title,
                entryInputs,
                request.lease,
                reviewSnapshot
              );
              if (!stored) {
                if (request.lease != null) throw new ProcessingCancelledError();
                throw new Error("Failed to store candidate revision");
              }
              return { outcome: "completed" };
            }
          }
        }

        if (document.activeRevisionId == null) {
          throwIfProcessingCancelled(signal);
          const activated = await this.options.activateRevision({
            ...request,
            expectedMainCurrency: mainCurrency,
            ...(request.lease == null ? {} : { lease: request.lease }),
            ...(output.title == null ? {} : { title: output.title }),
            entries: entryInputs,
          });
          if (!activated) {
            if (request.lease != null) throw new ProcessingCancelledError();
            const current = await this.options.getRevision(
              request.ledgerId,
              request.sourceDocumentId
            );
            if (current?.activeRevisionId !== request.revisionId) {
              throw new Error("Revision completion is stale");
            }
          }
        } else {
          throwIfProcessingCancelled(signal);
          const stored = await this.options.storeCandidateRevision(
            request.ledgerId,
            request.sourceDocumentId,
            request.revisionId,
            mainCurrency,
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
      } catch (error) {
        if (!(error instanceof LedgerMainCurrencyChangedError)) throw error;
      }
    }

    throw new ProcessingFailure(
      "exchange_rate_failure",
      "Ledger currency kept changing while the revision was being committed"
    );
  }
}
