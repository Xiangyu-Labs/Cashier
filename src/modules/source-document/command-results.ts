import type { AtomicBatchCommandResult, VersionedCommandResult } from "./contracts";

export interface SourceDocumentStaleTarget {
  sourceDocumentId: string;
  expectedVersion: number;
  currentVersion: number;
}

export class SourceDocumentStaleCommandError extends Error {
  readonly code = "SOURCE_DOCUMENT_STALE" as const;

  constructor(public readonly staleTargets: SourceDocumentStaleTarget[]) {
    super("Source document changed before the command completed");
    this.name = "SourceDocumentStaleCommandError";
  }
}

export function unwrapVersionedCommandResult<T>(result: VersionedCommandResult<T>): T {
  if (result.ok) return result.data;
  throw new SourceDocumentStaleCommandError([
    {
      sourceDocumentId: result.sourceDocumentId,
      expectedVersion: result.expectedVersion,
      currentVersion: result.currentVersion,
    },
  ]);
}

export function unwrapAtomicBatchCommandResult<T>(result: AtomicBatchCommandResult<T>): T {
  if (result.ok) return result.data;
  throw new SourceDocumentStaleCommandError(result.staleTargets);
}

/**
 * A missing browser-side version for an existing document is a programming
 * error, not a runtime condition to recover from — never guess a default.
 */
export function requireSourceDocumentVersion(
  version: number | null | undefined,
  sourceDocumentId: string
): number {
  if (version == null) {
    throw new Error(`Missing source document version: ${sourceDocumentId}`);
  }
  return version;
}
