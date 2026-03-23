import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/errors";

const {
  createEntryCategoryMock,
  createLedgerEntryWithConversionMock,
  createLedgerMock,
  createServiceCredentialMock,
  deleteServiceCredentialMock,
} = vi.hoisted(() => ({
  createEntryCategoryMock: vi.fn(),
  createLedgerEntryWithConversionMock: vi.fn(),
  createLedgerMock: vi.fn(),
  createServiceCredentialMock: vi.fn(),
  deleteServiceCredentialMock: vi.fn(),
}));

vi.mock("@/lib/auth-actions", () => ({
  withAuth:
    <TArgs extends unknown[], TResult>(handler: (userId: string, ...args: TArgs) => TResult) =>
    (...args: TArgs) =>
      handler("user-1", ...args),
}));

vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess: <TArgs extends unknown[], TResult>(
    handler: (ledgerId: string, ...args: TArgs) => TResult
  ) => handler,
}));

vi.mock("@/modules/ledger/use-cases", () => ({
  batchDeleteLedgerEntries: vi.fn(),
  batchUpdateLedgerEntries: vi.fn(),
  createEntryCategory: createEntryCategoryMock,
  createLedger: createLedgerMock,
  createLedgerEntryWithConversion: createLedgerEntryWithConversionMock,
  createServiceCredential: createServiceCredentialMock,
  deleteEntryCategory: vi.fn(),
  deleteLedgerEntry: vi.fn(),
  deleteServiceCredential: deleteServiceCredentialMock,
  reorderEntryCategories: vi.fn(),
  updateEntryCategory: vi.fn(),
  updateLedgerEntryWithConversion: vi.fn(),
}));

vi.mock("@/modules/ledger/queries", () => ({
  getUncategorizedEntryCount: vi.fn(),
  listEntryCategories: vi.fn(),
  listLedgerEntries: vi.fn(),
  listServiceCredentials: vi.fn(),
}));

import { createLedgerAction } from "@/modules/ledger/server-actions/create";
import { createEntryCategoryAction } from "@/modules/ledger/server-actions/categories";
import { createLedgerEntryAction } from "@/modules/ledger/server-actions/entries";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
} from "@/modules/ledger/server-actions/credentials";

describe("ledger server-action validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLedgerMock.mockResolvedValue({ id: "ledger-1" });
    createEntryCategoryMock.mockResolvedValue({ id: "category-1" });
    createLedgerEntryWithConversionMock.mockResolvedValue({ id: "entry-1" });
    createServiceCredentialMock.mockResolvedValue({ id: "credential-1" });
    deleteServiceCredentialMock.mockResolvedValue(undefined);
  });

  it("createLedgerAction rejects invalid payload with ValidationError", async () => {
    await expect(createLedgerAction({ aiLanguage: "x".repeat(200) } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(createLedgerMock).not.toHaveBeenCalled();
  });

  it("createEntryCategoryAction rejects invalid payload with ValidationError", async () => {
    await expect(createEntryCategoryAction("ledger-1", { name: "" } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(createEntryCategoryMock).not.toHaveBeenCalled();
  });

  it("createLedgerEntryAction rejects invalid sourceDocumentId with ValidationError", async () => {
    await expect(
      createLedgerEntryAction("ledger-1", {
        amount: 1,
        itemName: "x",
        sourceDocumentId: "bad-id",
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createLedgerEntryWithConversionMock).not.toHaveBeenCalled();
  });

  it("createServiceCredentialAction rejects blank name with ValidationError", async () => {
    await expect(
      createServiceCredentialAction("ledger-1", { name: "" } as never)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createServiceCredentialMock).not.toHaveBeenCalled();
  });

  it("deleteServiceCredentialAction rejects invalid credential id with ValidationError", async () => {
    await expect(deleteServiceCredentialAction("ledger-1", "bad-id")).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(deleteServiceCredentialMock).not.toHaveBeenCalled();
  });
});
