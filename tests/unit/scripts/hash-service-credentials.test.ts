import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { serviceCredentials } from "@/persistence";
import { and, eq, isNull, sql } from "drizzle-orm";
import { computeHash, prefixSuffix, createToken, authenticateToken } from "@/lib/security/service-credential-token";

/**
 * Tests for the migration script logic (backfill, verify, clear-plaintext).
 *
 * These tests exercise the same SQL operations the standalone migration script
 * performs, using the test database directly.
 */

describe("hash-service-credentials migration", () => {
  let ledgerId = "";

  const LEGACY_KEY_1 = "sk_live_legacy_key_one_123456789012345678901234567890";
  const LEGACY_KEY_2 = "sk_live_legacy_key_two_abcdefabcdefabcdefabcdefabcdefab";

  beforeAll(async () => {
    process.env.API_KEY_PEPPER = process.env.API_KEY_PEPPER ?? "test-pepper-for-testing-only";
  });

  beforeEach(async () => {
    const db = getTestDb();
    // Clean up any existing credentials for clean state
    await db.delete(serviceCredentials).where(sql`1=1`);
    const { ledgerId: lid } = await createTestUserWithLedger(db);
    ledgerId = lid;
  });

  describe("backfill", () => {
    it("computes hash, prefix, and suffix for credentials with plaintext key", async () => {
      const db = getTestDb();

      // Insert a credential with plaintext key but no hash
      await db.insert(serviceCredentials).values({
        id: "backfill-test-1",
        ledgerId,
        name: "Legacy Key",
        key: LEGACY_KEY_1,
        tokenHash: null,
        tokenPrefix: null,
        tokenSuffix: null,
      });

      // Simulate backfill: compute hash and update
      const expectedHash = computeHash(LEGACY_KEY_1);
      const { prefix, suffix } = prefixSuffix(LEGACY_KEY_1);

      await db
        .update(serviceCredentials)
        .set({ tokenHash: expectedHash, tokenPrefix: prefix, tokenSuffix: suffix })
        .where(eq(serviceCredentials.id, "backfill-test-1"));

      // Verify
      const updated = await db.query.serviceCredentials.findFirst({
        where: eq(serviceCredentials.id, "backfill-test-1"),
      });
      expect(updated?.tokenHash).toBe(expectedHash);
      expect(updated?.tokenPrefix).toBe("sk_live_");
      expect(updated?.tokenSuffix).toBe("7890");
      // Key should still be present (not cleared yet)
      expect(updated?.key).toBe(LEGACY_KEY_1);

      // Verify the token still authenticates
      expect(authenticateToken(LEGACY_KEY_1, updated?.tokenHash ?? "")).toBe(true);
    });

    it("is resumable: only updates rows without token_hash", async () => {
      const db = getTestDb();

      // Insert two credentials: one already has hash, one doesn't
      const existingToken = createToken();
      await db.insert(serviceCredentials).values([
        {
          id: "already-migrated",
          ledgerId,
          name: "Already Migrated",
          key: LEGACY_KEY_1,
          tokenHash: existingToken.hash,
          tokenPrefix: existingToken.prefix,
          tokenSuffix: existingToken.suffix,
        },
        {
          id: "needs-migration",
          ledgerId,
          name: "Needs Migration",
          key: LEGACY_KEY_2,
          tokenHash: null,
          tokenPrefix: null,
          tokenSuffix: null,
        },
      ]);

      // Simulate resumable backfill: only update rows with key but no hash
      const { rows: toBackfill } = await db.execute<{ id: string }>(
        sql`SELECT id FROM service_credentials WHERE key IS NOT NULL AND token_hash IS NULL AND deleted_at IS NULL`
      );

      expect(toBackfill).toHaveLength(1);
      expect(toBackfill[0]?.id).toBe("needs-migration");

      // Backfill the remaining row
      const expectedHash = computeHash(LEGACY_KEY_2);
      const { prefix, suffix } = prefixSuffix(LEGACY_KEY_2);
      await db
        .update(serviceCredentials)
        .set({ tokenHash: expectedHash, tokenPrefix: prefix, tokenSuffix: suffix })
        .where(eq(serviceCredentials.id, "needs-migration"));

      // Verify both are now hashed
      const migrated = await db.query.serviceCredentials.findFirst({
        where: eq(serviceCredentials.id, "needs-migration"),
      });
      expect(migrated?.tokenHash).toBe(expectedHash);

      // Already-migrated row should have its original hash unchanged
      const already = await db.query.serviceCredentials.findFirst({
        where: eq(serviceCredentials.id, "already-migrated"),
      });
      expect(already?.tokenHash).toBe(existingToken.hash);
    });

    it("handles mixed rows (some already migrated, some not)", async () => {
      const db = getTestDb();

      // Insert 3 credentials in different states
      const newCred = createToken();
      await db.insert(serviceCredentials).values([
        {
          id: "cred-new",
          ledgerId,
          name: "New (hash only, no key)",
          tokenHash: newCred.hash,
          tokenPrefix: newCred.prefix,
          tokenSuffix: newCred.suffix,
          // No key field
        },
        {
          id: "cred-legacy",
          ledgerId,
          name: "Legacy (key only, no hash)",
          key: "sk_live_mixed_test_12345678901234567890123456789012",
          tokenHash: null,
          tokenPrefix: null,
          tokenSuffix: null,
        },
        {
          id: "cred-deleted",
          ledgerId,
          name: "Deleted legacy",
          key: "sk_live_deleted_key_12345678901234567890123456789012",
          tokenHash: null,
          tokenPrefix: null,
          tokenSuffix: null,
          deletedAt: new Date(),
        },
      ]);

      // Backfill should only update the active legacy row
      const legacyHash = computeHash("sk_live_mixed_test_12345678901234567890123456789012");
      const { prefix, suffix } = prefixSuffix("sk_live_mixed_test_12345678901234567890123456789012");
      await db
        .update(serviceCredentials)
        .set({ tokenHash: legacyHash, tokenPrefix: prefix, tokenSuffix: suffix })
        .where(and(eq(serviceCredentials.id, "cred-legacy"), isNull(serviceCredentials.tokenHash)));

      // Verify all three rows
      const allRows = await db.query.serviceCredentials.findMany({
        where: eq(serviceCredentials.ledgerId, ledgerId),
      });

      const newRow = allRows.find((r) => r.id === "cred-new");
      expect(newRow?.tokenHash).toBe(newCred.hash);

      const legacyRow = allRows.find((r) => r.id === "cred-legacy");
      expect(legacyRow?.tokenHash).toBe(legacyHash);

      const deletedRow = allRows.find((r) => r.id === "cred-deleted");
      expect(deletedRow?.tokenHash).toBeNull();
    });
  });

  describe("verify", () => {
    it("passes verification for properly migrated credentials", async () => {
      const db = getTestDb();

      // Insert a properly migrated credential
      const { hash, prefix, suffix } = createToken();
      await db.insert(serviceCredentials).values({
        id: "verify-ok",
        ledgerId,
        name: "Properly Migrated",
        key: null,
        tokenHash: hash,
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      });

      // Insert a legacy credential that hasn't been migrated yet
      await db.insert(serviceCredentials).values({
        id: "verify-legacy",
        ledgerId,
        name: "Not Migrated",
        key: "sk_live_not_migrated_12345678901234567890123456789012",
        tokenHash: null,
        tokenPrefix: null,
        tokenSuffix: null,
      });

      // Verify by checking: all active rows should have token_hash
      const { rows: missingHash } = await db.execute<{ id: string }>(
        sql`SELECT id FROM service_credentials WHERE deleted_at IS NULL AND token_hash IS NULL`
      );

      expect(missingHash.some((r) => r.id === "verify-legacy")).toBe(true);
      expect(missingHash.some((r) => r.id === "verify-ok")).toBe(false);
    });

    it("detects hash mismatch between key and token_hash", async () => {
      const db = getTestDb();

      // Insert a credential with key but wrong hash
      const wrongHash = "a".repeat(64);
      await db.insert(serviceCredentials).values({
        id: "bad-hash",
        ledgerId,
        name: "Bad Hash",
        key: LEGACY_KEY_1,
        tokenHash: wrongHash,
        tokenPrefix: "sk_live_",
        tokenSuffix: "7890",
      });

      // Verify: hash should match
      const row = await db.query.serviceCredentials.findFirst({
        where: eq(serviceCredentials.id, "bad-hash"),
      });
      const expectedHash = computeHash(row?.key ?? "");
      expect(row?.tokenHash).toBe(wrongHash);
      expect(expectedHash).not.toBe(wrongHash);
    });
  });

  describe("clear-plaintext", () => {
    it("refuses to clear if any active row lacks token_hash", async () => {
      const db = getTestDb();

      // Insert a migrated row and an unmigrated row
      const { hash, prefix, suffix } = createToken();
      await db.insert(serviceCredentials).values([
        {
          id: "clear-migrated",
          ledgerId,
          name: "Migrated",
          key: LEGACY_KEY_1,
          tokenHash: hash,
          tokenPrefix: prefix,
          tokenSuffix: suffix,
        },
        {
          id: "clear-unmigrated",
          ledgerId,
          name: "Unmigrated",
          key: LEGACY_KEY_2,
          tokenHash: null,
          tokenPrefix: null,
          tokenSuffix: null,
        },
      ]);

      // Check that we cannot clear (there's an active row without hash)
      const { rows: missingHash } = await db.execute<{ id: string }>(
        sql`SELECT id FROM service_credentials WHERE deleted_at IS NULL AND token_hash IS NULL`
      );
      expect(missingHash).toHaveLength(1);
      expect(missingHash[0]?.id).toBe("clear-unmigrated");
    });

    it("clears plaintext key for all migrated rows", async () => {
      const db = getTestDb();

      // Insert migrated rows with key still set
      const hash1 = computeHash(LEGACY_KEY_1);
      const hash2 = computeHash(LEGACY_KEY_2);
      const { prefix: p1, suffix: s1 } = prefixSuffix(LEGACY_KEY_1);
      const { prefix: p2, suffix: s2 } = prefixSuffix(LEGACY_KEY_2);

      await db.insert(serviceCredentials).values([
        {
          id: "clear-1",
          ledgerId,
          name: "Clear Me 1",
          key: LEGACY_KEY_1,
          tokenHash: hash1,
          tokenPrefix: p1,
          tokenSuffix: s1,
        },
        {
          id: "clear-2",
          ledgerId,
          name: "Clear Me 2",
          key: LEGACY_KEY_2,
          tokenHash: hash2,
          tokenPrefix: p2,
          tokenSuffix: s2,
        },
      ]);

      // Verify both have keys before clearing
      const beforeRows = await db.query.serviceCredentials.findMany({
        where: eq(serviceCredentials.ledgerId, ledgerId),
      });
      expect(beforeRows.every((r) => r.key != null)).toBe(true);

      // Clear plaintext: set key to NULL for active rows with hash
      await db
        .update(serviceCredentials)
        .set({ key: null })
        .where(
          and(
            eq(serviceCredentials.ledgerId, ledgerId),
            isNull(serviceCredentials.deletedAt),
            sql`key IS NOT NULL AND token_hash IS NOT NULL`
          )
        );

      // Verify keys are cleared
      const afterRows = await db.query.serviceCredentials.findMany({
        where: eq(serviceCredentials.ledgerId, ledgerId),
      });
      expect(afterRows.every((r) => r.key == null)).toBe(true);

      // But hash/prefix/suffix remain
      expect(afterRows.every((r) => r.tokenHash != null)).toBe(true);
      expect(afterRows.every((r) => r.tokenPrefix != null)).toBe(true);
      expect(afterRows.every((r) => r.tokenSuffix != null)).toBe(true);
    });
  });

  describe("continued authentication after migration", () => {
    it("authenticates a legacy credential after backfill using the original token", async () => {
      const db = getTestDb();

      // Insert a credential with plaintext key (as it was before migration)
      await db.insert(serviceCredentials).values({
        id: "auth-after-backfill",
        ledgerId,
        name: "Auth Test",
        key: LEGACY_KEY_1,
        tokenHash: null,
        tokenPrefix: null,
        tokenSuffix: null,
      });

      // Simulate backfill
      const hash = computeHash(LEGACY_KEY_1);
      const { prefix, suffix } = prefixSuffix(LEGACY_KEY_1);
      await db
        .update(serviceCredentials)
        .set({ tokenHash: hash, tokenPrefix: prefix, tokenSuffix: suffix })
        .where(eq(serviceCredentials.id, "auth-after-backfill"));

      // Now test auth using the new hash-based method
      // The adapter's authenticate method computes hash from the key and matches against token_hash
      const { authenticateServiceCredential } = await import(
        "@/modules/ledger/application/services/authenticate-service-credential"
      );

      // Key should still be present since we haven't cleared it
      const result = await authenticateServiceCredential(LEGACY_KEY_1);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("auth-after-backfill");
      expect(result?.ledgerId).toBe(ledgerId);
    });
  });
});
