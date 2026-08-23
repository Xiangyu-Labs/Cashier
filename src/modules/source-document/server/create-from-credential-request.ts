import type { ProcessingIntentContract } from "@/application/contracts";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { ValidationError } from "@/lib/errors";
import { scheduleRequestMaintenance } from "@/application/transport/request-maintenance";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { preparedApiV1SourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";
import { scheduleProcessingAfter } from "../server-actions/schedule-processing";
import { scheduleProcessingRecoveryAfter } from "../server-actions/schedule-processing-recovery";

/**
 * Server-only facade for POST /api/v1/source-documents.
 *
 * A plain module function (not a "use server" action) that owns the prepared-
 * input validation, port injection, and request-bound `after()` callbacks for
 * the credential ingestion use case. The API route calls this facade instead
 * of assembling adapters or touching persistence directly.
 */
export async function createSourceDocumentFromCredentialRequest(input: {
  credential: AuthenticatedServiceCredentialContract;
  idempotencyKey?: string;
  requestId?: string;
  payload: unknown;
}): Promise<CreateSourceDocumentResponseDto> {
  const parsed = preparedApiV1SourceDocumentInputSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  const scheduleProcessing = (intent: ProcessingIntentContract) => {
    scheduleProcessingAfter(intent, input.requestId);
  };

  const result = await createSourceDocumentFromCredential(
    {
      credential: input.credential,
      ...(input.idempotencyKey == null ? {} : { idempotencyKey: input.idempotencyKey }),
      payload: {
        images: parsed.data.images,
        ...(parsed.data.entryDate == null ? {} : { entryDate: parsed.data.entryDate }),
      },
    },
    scheduleProcessing,
    {
      submissions: serverComposition.sourceDocumentSubmissions,
      storedFiles: serverComposition.storedFiles,
    }
  );

  // Also recover older pending intents for the ledger and run bounded
  // maintenance. The claim CAS makes duplicate scheduling harmless.
  scheduleProcessingRecoveryAfter(input.credential.ledgerId, input.requestId);
  scheduleRequestMaintenance();

  return result;
}
