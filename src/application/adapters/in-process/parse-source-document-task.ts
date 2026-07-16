import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { TaskContext, TaskDefinition, TaskHandler } from "@/lib/tasks";
import { TaskCancelledError } from "@/lib/tasks/cancellation";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { revisionFiles, sourceDocuments } from "@/persistence";
import {
  ProcessingCancelledError,
  type ParseSourceDocumentInput,
  type ParseSourceDocumentOutput,
} from "@/modules/source-document/application/parse-source-document/contracts";
export type {
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput,
} from "@/modules/source-document/application/parse-source-document/contracts";
import {
  buildStageContext,
  runParsePipeline,
} from "@/modules/source-document/application/parse-source-document/pipeline";
import { toParseSourceDocumentOutput } from "@/modules/source-document/application/parse-source-document/result-mapper";
import {
  handleParseCancel,
  handleParseError,
  handleParseResult,
} from "./legacy-processing/parse-result-handler";

export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

function activeDocument(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    eq(sourceDocuments.id, sourceDocumentId),
    ne(sourceDocuments.status, "deleted"),
    isNull(sourceDocuments.deletedAt)
  )!;
}

export const parseSourceDocumentHandler: TaskHandler<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  async execute(input, context: TaskContext): Promise<ParseSourceDocumentOutput> {
    if (input.ledgerId === "") throw new ValidationError("Missing ledgerId in task input");
    const doc = await db.query.sourceDocuments.findFirst({
      where: activeDocument(input.ledgerId, input.sourceDocumentId),
    });
    if (doc == null) throw new NotFoundError("Source document");

    await db
      .update(sourceDocuments)
      .set({ status: "processing" })
      .where(activeDocument(input.ledgerId, input.sourceDocumentId));
    const storedFileIds =
      input.storedFileIds ??
      (doc.pendingRevisionId == null
        ? []
        : (
            await db
              .select({ id: revisionFiles.storedFileId })
              .from(revisionFiles)
              .where(eq(revisionFiles.revisionId, doc.pendingRevisionId))
              .orderBy(asc(revisionFiles.position))
          ).map((file) => file.id));
    try {
      const result = await runParsePipeline(
        storedFileIds.length === 0
          ? input
          : { ...input, ledgerId: input.ledgerId, storedFileIds },
        buildStageContext({
          signal: context.signal,
          ai: context.ai,
          setProgress: context.updateProgress,
          docId: input.sourceDocumentId,
          ledgerId: input.ledgerId,
        })
      );
      return toParseSourceDocumentOutput(result);
    } catch (error) {
      if (error instanceof ProcessingCancelledError) throw new TaskCancelledError();
      throw error;
    }
  },

  async onComplete(output, input): Promise<void> {
    await handleParseResult({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      parsedEntries: output.ledgerEntries,
      verificationStatus: output.verificationStatus,
      categories: input.categories,
      ...(output.title === undefined ? {} : { title: output.title }),
      ...(output.anomalyReason === undefined ? {} : { anomalyReason: output.anomalyReason }),
    });
  },

  async onError(error, input): Promise<void> {
    logger.error({ error, sourceDocumentId: input.sourceDocumentId }, "Parsing failed");
    await handleParseError({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      error,
    });
  },

  async onCancel(input): Promise<void> {
    logger.info({ sourceDocumentId: input.sourceDocumentId }, "Parsing cancelled");
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
