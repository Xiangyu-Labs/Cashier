"use client";

import { useEffect, useRef } from "react";

interface UseSourceDocumentRevisionGuardOptions {
  hasPendingChanges: boolean;
  isEditing: boolean;
  version: number | undefined;
}

/**
 * Tracks the document version a draft started from. A newer server snapshot
 * never rebases local edits implicitly.
 */
export function useSourceDocumentRevisionGuard({
  hasPendingChanges,
  isEditing,
  version,
}: UseSourceDocumentRevisionGuardOptions) {
  const baseVersionRef = useRef<number | null>(null);

  useEffect(() => {
    if (isEditing || hasPendingChanges) {
      baseVersionRef.current ??= version ?? null;
    } else {
      baseVersionRef.current = null;
    }
  }, [hasPendingChanges, isEditing, version]);

  const hasVersionConflict =
    hasPendingChanges &&
    baseVersionRef.current != null &&
    version != null &&
    baseVersionRef.current !== version;

  return { baseVersionRef, hasVersionConflict };
}
