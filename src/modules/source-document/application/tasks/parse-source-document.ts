import type { TaskDefinition, TaskHandler, TaskContext } from "@/lib/tasks";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { type CategoryInfo, type ParsedLedgerEntry } from "@/lib/ai/types";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { buildStageContext, runParsePipeline } from "../parse-source-document/pipeline";
import { toParseSourceDocumentOutput } from "../parse-source-document/result-mapper";
import {
  handleParseResult,
  handleParseError,
  handleParseCancel,
} from "../parse-source-document/parse-result-handler";
import { whereSourceDocumentNotDeletedId } from "../source-document-state";

// Task type constant
export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

export interface ParseSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  text?: string;
  imageUrls?: string[];
  categories: CategoryInfo[];
  aiLanguage?: string;
  settings: {
    aiCustomPrompt?: string;
  };
  preferredCurrencies?: string[];
}

export interface ParseSourceDocumentOutput {
  ledgerEntries: ParsedLedgerEntry[];
  title?: string;
  anomalyReason?: string;
  verificationStatus: "passed" | "anomaly" | "invalid";
}

export const parseSourceDocumentHandler: TaskHandler<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  async execute(
    input: ParseSourceDocumentInput,
    context: TaskContext
  ): Promise<ParseSourceDocumentOutput> {
    const { signal, updateProgress, ai } = context;
    const { ledgerId } = input;

    if (ledgerId == null || ledgerId === "") {
      throw new ValidationError("Missing ledgerId in task input");
    }

    // Validate document exists
    const doc = await db.query.sourceDocuments.findFirst({
      where: whereSourceDocumentNotDeletedId(ledgerId, input.sourceDocumentId),
    });
    if (!doc) {
      throw new NotFoundError("Source document");
    }

    const stageContext = buildStageContext({
      signal,
      ai,
      setProgress: updateProgress,
      docId: input.sourceDocumentId,
      ledgerId,
    });

    await db
      .update(sourceDocuments)
      .set({ status: "processing" })
      .where(whereSourceDocumentNotDeletedId(ledgerId, input.sourceDocumentId));

    const pipelineResult = await runParsePipeline(input, stageContext);
    return toParseSourceDocumentOutput(pipelineResult);
  },

  async onComplete(
    output: ParseSourceDocumentOutput,
    input: ParseSourceDocumentInput,
    _context: TaskContext
  ): Promise<void> {
    await handleParseResult({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      parsedEntries: output.ledgerEntries,
      verificationStatus: output.verificationStatus,
      categories: input.categories,
      ...(output.title !== undefined ? { title: output.title } : {}),
      ...(output.anomalyReason !== undefined ? { anomalyReason: output.anomalyReason } : {}),
    });
  },

  async onError(
    error: Error,
    input: ParseSourceDocumentInput,
    _context: TaskContext
  ): Promise<void> {
    logger.error(
      { error, sourceDocumentId: input.sourceDocumentId },
      "Parse source document task failed"
    );

    await handleParseError({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      error,
    });
  },

  async onCancel(input: ParseSourceDocumentInput, _context: TaskContext): Promise<void> {
    logger.info(
      { sourceDocumentId: input.sourceDocumentId },
      "Parse source document task cancelled"
    );

    await handleParseCancel({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
    });
  },
};

export const parseSourceDocumentTaskDefinition: TaskDefinition<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
  handler: parseSourceDocumentHandler,
};
