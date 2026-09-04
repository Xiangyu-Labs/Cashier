"use client";

import { useEffect, useRef } from "react";

interface UseSourceDocumentRevisionGuardOptions {
  hasPendingChanges: boolean;
  version: number | undefined;
}

/**
 * Tracks the document version a draft started from. A newer server snapshot
 * never rebases local edits implicitly.
 */
export function useSourceDocumentRevisionGuard({
  hasPendingChanges,
  version,
}: UseSourceDocumentRevisionGuardOptions) {
  const baseVersionRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasPendingChanges) {
      baseVersionRef.current ??= version ?? null;
    } else {
      baseVersionRef.current = null;
    }
  }, [hasPendingChanges, version]);

  const hasVersionConflict =
    hasPendingChanges &&
    baseVersionRef.current != null &&
    version != null &&
    baseVersionRef.current !== version;

  return { baseVersionRef, hasVersionConflict };
}
