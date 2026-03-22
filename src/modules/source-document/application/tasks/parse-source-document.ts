import type { FlowTaskDefinition, FlowTaskHandler, FlowContext } from "@/lib/flow";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { type CategoryInfo, type ParsedLedgerEntry } from "@/lib/ai/types";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { buildStageContext } from "../parse-source-document/context";
import { executeParseSourceDocument } from "../parse-source-document/execute";
import {
  handleParseResult,
  handleParseError,
  handleParseCancel,
} from "../parse-source-document/parse-result-handler";

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

export const parseSourceDocumentHandler: FlowTaskHandler<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  async execute(
    input: ParseSourceDocumentInput,
    context: FlowContext
  ): Promise<ParseSourceDocumentOutput> {
    const { signal, updateProgress, ai } = context;
    const { ledgerId } = input;

    if (ledgerId == null || ledgerId === "") {
      throw new ValidationError("Missing ledgerId in task input");
    }

    // Validate document exists
    const doc = await db.query.sourceDocuments.findFirst({
      where: and(
        eq(sourceDocuments.id, input.sourceDocumentId),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt)
      ),
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
      .where(stageContext.q.whereId(input.sourceDocumentId));

    return executeParseSourceDocument(input, stageContext);
  },

  async onComplete(
    output: ParseSourceDocumentOutput,
    input: ParseSourceDocumentInput,
    _context: FlowContext
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
    _context: FlowContext
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

  async onCancel(input: ParseSourceDocumentInput, _context: FlowContext): Promise<void> {
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

export const parseSourceDocumentTaskDefinition: FlowTaskDefinition<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
  handler: parseSourceDocumentHandler,
};
