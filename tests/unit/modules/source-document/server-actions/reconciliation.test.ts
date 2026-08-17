import { describe, expect, it } from "vitest";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { buildEntityReconciliation } from "@/modules/source-document/server-actions/reconciliation";

describe("buildEntityReconciliation", () => {
  it("supports sparse entities that preserve omitted cached collections", () => {
    const entity = {
      id: "doc-1",
      updatedAt: "2026-08-17T00:00:00.000Z",
    } as SourceDocumentListItemDto;

    const reconciliation = buildEntityReconciliation(
      "operation-1",
      entity,
      entity.updatedAt,
      true,
      true,
      "sparse"
    );

    expect(reconciliation.entityCompleteness).toBe("sparse");
  });
});
