import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, softDeleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  softDeleteMock: vi.fn(),
}));

import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
import type { SourceDocumentRevisionPort } from "@/modules/source-document/application/ports";

const revisions = {
  get: getMock,
  softDelete: softDeleteMock,
} as unknown as SourceDocumentRevisionPort;

describe("deleteSourceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deleted false when the target document is absent", async () => {
    getMock.mockResolvedValue(null);

    await expect(
      deleteSourceDocument({ ledgerId: "ledger-1", sourceDocumentId: "doc-1" }, revisions)
    ).resolves.toEqual({ sourceDocumentId: "doc-1", deleted: false });
    expect(getMock).toHaveBeenCalledWith("ledger-1", "doc-1");
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it("uses the target soft-delete transaction when delete is supported", async () => {
    getMock.mockResolvedValue({
      id: "doc-1",
      ledgerId: "ledger-1",
      activeRevisionId: "revision-1",
      pendingRevisionId: "revision-2",
      supportedActions: ["delete"],
    });
    softDeleteMock.mockResolvedValue(true);

    await expect(
      deleteSourceDocument({ ledgerId: "ledger-1", sourceDocumentId: "doc-1" }, revisions)
    ).resolves.toEqual({ sourceDocumentId: "doc-1", deleted: true });
    expect(softDeleteMock).toHaveBeenCalledWith("ledger-1", "doc-1");
  });

  it("does not mutate when current revision rules do not support delete", async () => {
    getMock.mockResolvedValue({
      id: "doc-1",
      ledgerId: "ledger-1",
      activeRevisionId: null,
      pendingRevisionId: null,
      supportedActions: [],
    });

    await expect(
      deleteSourceDocument({ ledgerId: "ledger-1", sourceDocumentId: "doc-1" }, revisions)
    ).resolves.toEqual({ sourceDocumentId: "doc-1", deleted: false });
    expect(softDeleteMock).not.toHaveBeenCalled();
  });
});
