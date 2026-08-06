import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryPort, ServiceCredentialPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import { getLedgerSettingsBootstrap as getBootstrap } from "@/modules/workspace/application/queries/get-ledger-settings-bootstrap";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const getLedgerSettingsViewMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));
vi.mock("@/modules/ledger/application/queries/list-entry-categories", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));
vi.mock("@/modules/ledger/application/queries/get-ledger-settings-view", () => ({
  getLedgerSettingsView: getLedgerSettingsViewMock,
}));

const dependencies = {
  categories: {} as CategoryPort,
  credentials: {} as ServiceCredentialPort,
};

const ledgerDto = {
  id: "ledger-1",
  userId: "user-1",
  settings: { mainCurrency: "USD" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("getLedgerSettingsBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: ledgerDto });
    listEntryCategoriesMock.mockResolvedValue([]);
    getLedgerSettingsViewMock.mockResolvedValue({
      uncategorizedCount: 0,
      credentials: [],
    });
  });

  it("hydrates only ledger, categories, and settings queries", async () => {
    const result = await getBootstrap({ ledgerId: "ledger-1", ledgerDto }, dependencies);

    expect(result).not.toBeNull();
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
    expect(listEntryCategoriesMock).toHaveBeenCalledWith("ledger-1", dependencies.categories);
    expect(getLedgerSettingsViewMock).toHaveBeenCalledWith("ledger-1", {
      categories: dependencies.categories,
      credentials: dependencies.credentials,
    });
    expect(result?.dehydratedState.queries.map((query) => query.queryKey[0])).toEqual(
      expect.arrayContaining(["ledger", "entryCategories", "ledgerSettings"])
    );
    expect(
      result?.dehydratedState.queries.some((query) =>
        ["sourceDocuments", "ledgerEntries", "summary", "enhanced-stats"].includes(
          String(query.queryKey[0])
        )
      )
    ).toBe(false);
  });

  it("returns null for not-found access", async () => {
    requireLedgerAccessMock.mockRejectedValueOnce(new NotFoundError("ledger"));

    await expect(getBootstrap({ ledgerId: "missing" }, dependencies)).resolves.toBeNull();
  });
});
