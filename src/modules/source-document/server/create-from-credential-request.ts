import type { ProcessingIntentContract } from "@/application/contracts";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { scheduleRequestMaintenance } from "@/application/transport/request-maintenance";
import type { SourceDocumentSubmissionContract } from "@/application/contracts";
import type { PreparedApiV1SourceDocumentInput } from "@/modules/source-document/api-v1-policy";
import { createSourceDocumentFromCredential } from "../application/use-cases/create-from-credential";
import { scheduleProcessingAfter } from "../server-actions/schedule-processing";
import { scheduleProcessingRecoveryAfter } from "../server-actions/schedule-processing-recovery";

/**
 * Server-only facade for POST /api/v1/source-documents.
 *
 * A plain module function (not a "use server" action) that owns port injection
 * and request-bound `after()` callbacks for the credential ingestion use case.
 */
export async function createSourceDocumentFromCredentialRequest(input: {
  credential: AuthenticatedServiceCredentialContract;
  idempotencyKey?: string;
  requestId?: string;
  payload: PreparedApiV1SourceDocumentInput;
}): Promise<SourceDocumentSubmissionContract> {
  const scheduleProcessing = (intent: ProcessingIntentContract) => {
    scheduleProcessingAfter(intent, input.requestId);
  };

  const result = await createSourceDocumentFromCredential(
    {
      credential: input.credential,
      ...(input.idempotencyKey == null ? {} : { idempotencyKey: input.idempotencyKey }),
      payload: input.payload,
    },
    scheduleProcessing,
    {
      submissions: {
        createPendingWithIntent: serverComposition.sourceDocumentAggregate.createProcessingDocument,
        createIdempotentPendingWithIntent:
          serverComposition.sourceDocumentAggregate.createIdempotentProcessingDocument,
      },
      storedFiles: serverComposition.storedFiles,
    }
  );

  // Also recover older pending intents for the ledger and run bounded
  // maintenance. The claim CAS makes duplicate scheduling harmless.
  scheduleProcessingRecoveryAfter(input.credential.ledgerId, input.requestId);
  scheduleRequestMaintenance();

  return result;
}
