import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { serviceCredentials } from "@/persistence";

const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/error-handlers", () => ({
  logError: logErrorMock,
}));

import { authenticateServiceCredential } from "./authenticate-service-credential";

describe("authenticateServiceCredential", () => {
  let ledgerId = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    const setup = await createTestUserWithLedger(getTestDb());
    ledgerId = setup.ledgerId;
  });

  it("returns null for missing or soft-deleted credentials", async () => {
    const db = getTestDb();
    await db.insert(serviceCredentials).values({
      id: crypto.randomUUID(),
      ledgerId,
      name: "deleted",
      key: "sk_deleted",
      deletedAt: new Date(),
    });

    await expect(authenticateServiceCredential("missing")).resolves.toBeNull();
    await expect(authenticateServiceCredential("sk_deleted")).resolves.toBeNull();
  });

  it("returns the credential and updates lastUsedAt", async () => {
    const db = getTestDb();
    await db.insert(serviceCredentials).values({
      id: "credential-1",
      ledgerId,
      name: "primary",
      key: "sk_primary",
      lastUsedAt: null,
    });

    const result = await authenticateServiceCredential("sk_primary");
    const updated = await db.query.serviceCredentials.findFirst({
      where: (table, { eq }) => eq(table.id, "credential-1"),
    });

    expect(result?.id).toBe("credential-1");
    expect(updated?.lastUsedAt).not.toBeNull();
  });

  it("logs and still returns the credential when lastUsedAt update fails", async () => {
    const db = getTestDb();
    await db.insert(serviceCredentials).values({
      id: "credential-2",
      ledgerId,
      name: "broken",
      key: "sk_broken",
    });

    const updateSpy = vi.spyOn(db, "update").mockImplementationOnce(() => {
      throw new Error("update failed");
    });

    const result = await authenticateServiceCredential("sk_broken");

    expect(result?.id).toBe("credential-2");
    expect(logErrorMock).toHaveBeenCalledWith(
      "modules/ledger:authenticate-service-credential:update-last-used",
      expect.any(Error)
    );
    updateSpy.mockRestore();
  });
});
