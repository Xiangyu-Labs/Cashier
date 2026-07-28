import type {
  DirectStoredFilePort,
  IdempotencyPort,
  ProcessingIntentContract,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { processImage } from "@/lib/storage/image-processing";
import type { CreateApiV2SourceDocumentInput } from "@/app/api/v2/_shared/schemas";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import type { InlineImageUploader } from "./prepare-inline-images";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

interface Dependencies {
  idempotency: IdempotencyPort;
  storedFiles: DirectStoredFilePort & InlineImageUploader;
  submissions: SourceDocumentSubmissionPort;
}

export async function createSourceDocumentV2FromCredential(
  input: {
    credentialId: string;
    ledgerId: string;
    idempotencyKey?: string;
    payload: CreateApiV2SourceDocumentInput;
  },
  scheduleProcessing: (intent: ProcessingIntentContract) => void,
  dependencies: Dependencies = {
    idempotency: currentApplication.idempotency,
    storedFiles: currentApplication.storedFiles,
    submissions: currentApplication.sourceDocumentSubmissions,
  }
): Promise<CreateSourceDocumentResponseDto> {
  const create = async () => {
    const settings = await currentApplication.settings.get(input.ledgerId);
    const storedFileIds =
      input.payload.upload == null
        ? []
        : await dependencies.storedFiles
            .finalizeDirectUpload({
              ...input.payload.upload,
              ownerLedgerId: input.ledgerId,
            })
            .then((files) => files.map((file) => file.id));

    return createAndQueueSourceDocument(
      {
        ledgerId: input.ledgerId,
        ledger: { settings: settings ?? {} },
        entryDate: input.payload.entryDate,
        ...(input.payload.text === undefined ? {} : { text: input.payload.text }),
        ...(storedFileIds.length === 0 ? {} : { storedFileIds }),
      },
      {
        submissions: dependencies.submissions,
        storedFiles: dependencies.storedFiles,
        processImage,
        scheduleProcessing,
      }
    );
  };

  if (input.idempotencyKey == null) return create();
  return dependencies.idempotency.execute(
    `api-v2:${input.credentialId}:${input.idempotencyKey}`,
    create
  );
}
