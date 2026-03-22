import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

const { requireLedgerAccessMock } = vi.hoisted(() => ({
  requireLedgerAccessMock: vi.fn(),
}));

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

import { withSourceDocumentLedgerAccess } from "@/modules/source-document/server-actions/access";

describe("withSourceDocumentLedgerAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves NotFoundError from requireLedgerAccess", async () => {
    requireLedgerAccessMock.mockRejectedValue(new NotFoundError("Ledger"));

    const wrapped = withSourceDocumentLedgerAccess(async () => "ok");
    const error = await wrapped("ledger-id").catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Unauthorized or Ledger not found");
  });

  it("preserves ForbiddenError from requireLedgerAccess", async () => {
    const forbidden = new ForbiddenError("Forbidden");
    requireLedgerAccessMock.mockRejectedValue(forbidden);

    const wrapped = withSourceDocumentLedgerAccess(async () => "ok");
    const error = await wrapped("ledger-id").catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect(error).toBe(forbidden);
  });

  it("preserves ValidationError from requireLedgerAccess", async () => {
    const validation = new ValidationError("Invalid ledger id");
    requireLedgerAccessMock.mockRejectedValue(validation);

    const wrapped = withSourceDocumentLedgerAccess(async () => "ok");
    const error = await wrapped("ledger-id").catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect(error).toBe(validation);
  });
});
