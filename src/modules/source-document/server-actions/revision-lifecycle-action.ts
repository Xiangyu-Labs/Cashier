import type { SourceDocumentLifecyclePort } from "@/modules/source-document/application/ports";
import type { VersionedCommandResult } from "@/modules/source-document/contracts";
import { versionedTargetSchema } from "@/modules/source-document/contract-schemas";
import { StaleSourceDocumentVersionError } from "@/lib/errors";
import { staleVersionedCommandResult } from "@/modules/source-document/application/versioned-command-result";
import { serverComposition } from "@/application/server-composition-root";
import { withSourceDocumentLedgerAccess } from "./access";

interface RevisionLifecycleInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
}

type RevisionLifecycleUseCase<TResult> = (
  input: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
) => Promise<{ version: number; data: TResult }>;

export function revisionLifecycleAction<TResult>(useCase: RevisionLifecycleUseCase<TResult>) {
  return withSourceDocumentLedgerAccess(
    async (
      { ledgerId },
      sourceDocumentId: string,
      expectedVersion: number
    ): Promise<VersionedCommandResult<TResult>> => {
      const target = versionedTargetSchema.parse({ sourceDocumentId, expectedVersion });
      try {
        const result = await useCase(
          {
            ledgerId,
            sourceDocumentId: target.sourceDocumentId,
            expectedVersion: target.expectedVersion,
          },
          serverComposition.sourceDocumentLifecycle
        );
        return {
          ok: true,
          sourceDocumentId: target.sourceDocumentId,
          version: result.version,
          data: result.data,
        };
      } catch (error) {
        if (error instanceof StaleSourceDocumentVersionError) {
          return staleVersionedCommandResult<TResult>(error);
        }
        throw error;
      }
    }
  );
}
