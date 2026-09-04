export function hasEditableActiveProjection<
  T extends {
    currentStatus: string;
    activeRevisionId: string | null;
    pendingRevisionId: string | null;
  },
>(
  document: T
): document is T & {
  currentStatus: "completed";
  activeRevisionId: string;
  pendingRevisionId: null;
} {
  return (
    document.currentStatus === "completed" &&
    document.activeRevisionId !== null &&
    document.pendingRevisionId === null
  );
}
