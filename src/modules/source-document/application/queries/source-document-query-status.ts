import { inArray, type SQL } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";
import type { SourceDocumentStatusType } from "../../types";

export function buildSourceDocumentStatusCondition(
  status: string | null | undefined
): SQL<unknown> | null {
  if (status == null || status === "") return null;

  const statuses = status.split(",").filter(Boolean);
  if (statuses.length === 0) return null;

  return inArray(sourceDocuments.status, statuses as SourceDocumentStatusType[]);
}
