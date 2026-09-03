import type { SourceDocumentLifecyclePort } from "@/modules/source-document/application/ports";
import { parseRevisionMutationIdentity } from "@/modules/source-document/contract-schemas";
import { serverComposition } from "@/application/server-composition-root";
import { withSourceDocumentLedgerAccess } from "./access";

interface RevisionLifecycleInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

type RevisionLifecycleUseCase<TResult> = (
  input: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
) => Promise<TResult>;

export function revisionLifecycleAction<TResult>(useCase: RevisionLifecycleUseCase<TResult>) {
  return withSourceDocumentLedgerAccess(
    async (
      { ledgerId },
      sourceDocumentId: string,
      revisionId: string,
      operationId?: string
    ): Promise<TResult> => {
      const identity = parseRevisionMutationIdentity({
        sourceDocumentId,
        revisionId,
        ...(operationId === undefined ? {} : { operationId }),
      });
      return useCase(
        {
          ledgerId,
          sourceDocumentId: identity.sourceDocumentId,
          revisionId: identity.revisionId,
        },
        serverComposition.sourceDocumentLifecycle
      );
    }
  );
}
