import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "@/lib/errors";

vi.mock("@/modules/source-document/server-actions/access", () => ({
  withSourceDocumentLedgerAccess: vi.fn((action) => {
    return async (ledgerId: string, ...args: unknown[]) => {
      if (ledgerId === "unauthorized-ledger") {
        throw new UnauthorizedError("Unauthorized or Ledger not found");
      }
      return action({ ledgerId }, ...args);
    };
  }),
}));

vi.mock("@/modules/source-document/application/queries/get-source-document-light", () => ({
  getSourceDocumentLightForLedger: vi.fn().mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
  }),
}));

const sourceDocumentId = "11111111-1111-4111-8111-111111111111";

describe("getSourceDocumentLightAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError for unauthorized ledger", async () => {
    const { getSourceDocumentLightAction } =
      await import("@/modules/source-document/server-actions/get-document-light");
    await expect(
      getSourceDocumentLightAction("unauthorized-ledger", sourceDocumentId)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns document for authorized ledger", async () => {
    const { getSourceDocumentLightAction } =
      await import("@/modules/source-document/server-actions/get-document-light");
    const result = await getSourceDocumentLightAction("valid-ledger", sourceDocumentId);
    expect(result).toEqual({ id: sourceDocumentId });
  });

  it("validates the document identity inside the action", async () => {
    const { getSourceDocumentLightAction } =
      await import("@/modules/source-document/server-actions/get-document-light");
    await expect(getSourceDocumentLightAction("valid-ledger", "not-a-uuid")).rejects.toThrow(
      "Validation failed"
    );
  });
});
