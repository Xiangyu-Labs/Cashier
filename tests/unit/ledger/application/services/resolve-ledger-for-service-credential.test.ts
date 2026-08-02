import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { ledgers, serviceCredentials } from "@/persistence";
import { createToken } from "@/lib/security/service-credential-token";

const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/error-handlers", () => ({
  logError: logErrorMock,
}));

import { resolveLedgerForServiceCredential } from "@/modules/ledger/application/services/resolve-ledger-for-service-credential";

describe("resolveLedgerForServiceCredential", () => {
  let ledgerId = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    const setup = await createTestUserWithLedger(getTestDb());
    ledgerId = setup.ledgerId;
  });

  it("returns null for missing or deleted credentials", async () => {
    const db = getTestDb();
    const credentialId = crypto.randomUUID();
    await db.insert(serviceCredentials).values({
      id: credentialId,
      ledgerId,
      name: "deleted",
      tokenHash: createToken().hash,
      tokenPrefix: "sk_live_",
      tokenSuffix: "dead",
      deletedAt: new Date(),
    });

    await expect(resolveLedgerForServiceCredential(crypto.randomUUID())).resolves.toBeNull();
    await expect(resolveLedgerForServiceCredential(credentialId)).resolves.toBeNull();
  });

  it("returns the active ledger for an active credential and updates lastUsedAt", async () => {
    const db = getTestDb();
    const credentialId = crypto.randomUUID();
    await db.insert(serviceCredentials).values({
      id: credentialId,
      ledgerId,
      name: "active",
      tokenHash: createToken().hash,
      tokenPrefix: "sk_live_",
      tokenSuffix: "live",
      lastUsedAt: null,
    });

    const result = await resolveLedgerForServiceCredential(credentialId);
    const updated = await db.query.serviceCredentials.findFirst({
      where: (table, { eq }) => eq(table.id, credentialId),
    });

    expect(result?.id).toBe(ledgerId);
    expect(updated?.lastUsedAt).not.toBeNull();
  });

  it("returns null when the target ledger is soft deleted", async () => {
    const db = getTestDb();
    const credentialId = crypto.randomUUID();
    await db.insert(serviceCredentials).values({
      id: credentialId,
      ledgerId,
      name: "soft-deleted-ledger",
      tokenHash: createToken().hash,
      tokenPrefix: "sk_live_",
      tokenSuffix: "soft",
    });
    await db.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, ledgerId));

    await expect(resolveLedgerForServiceCredential(credentialId)).resolves.toBeNull();
  });
});
