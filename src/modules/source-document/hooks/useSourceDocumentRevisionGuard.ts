"use client";

import { useEffect, useRef } from "react";

interface UseSourceDocumentRevisionGuardOptions {
  hasPendingChanges: boolean;
  activeRevisionId: string | null | undefined;
}

/**
 * Tracks the revision a draft was started against so a concurrent server-side
 * save can be detected as a conflict. `draftRevisionIdRef` is intentionally set
 * with `??=`, not `=`: once a draft starts, later `activeRevisionId` changes
 * while it's still pending must NOT overwrite the baseline, or the conflict
 * they represent would go undetected.
 */
export function useSourceDocumentRevisionGuard({
  hasPendingChanges,
  activeRevisionId,
}: UseSourceDocumentRevisionGuardOptions) {
  const draftRevisionIdRef = useRef<string | null>(null);
  const saveOperationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasPendingChanges) {
      draftRevisionIdRef.current ??= activeRevisionId ?? null;
    } else {
      draftRevisionIdRef.current = null;
      saveOperationIdRef.current = null;
    }
  }, [hasPendingChanges, activeRevisionId]);

  const hasRevisionConflict =
    hasPendingChanges &&
    draftRevisionIdRef.current != null &&
    activeRevisionId != null &&
    draftRevisionIdRef.current !== activeRevisionId;

  return { draftRevisionIdRef, saveOperationIdRef, hasRevisionConflict };
}
