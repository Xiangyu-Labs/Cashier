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
  getSourceDocumentLight: vi.fn().mockResolvedValue({ id: "doc-1" }),
}));

describe("getSourceDocumentLightAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError for unauthorized ledger", async () => {
    const { getSourceDocumentLightAction } =
      await import("@/modules/source-document/server-actions/get-document-light");
    await expect(
      getSourceDocumentLightAction("unauthorized-ledger", "doc-1")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns document for authorized ledger", async () => {
    const { getSourceDocumentLightAction } =
      await import("@/modules/source-document/server-actions/get-document-light");
    const result = await getSourceDocumentLightAction("valid-ledger", "doc-1");
    expect(result).toEqual({ id: "doc-1" });
  });
});
