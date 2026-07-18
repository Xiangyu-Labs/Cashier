import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as ledgerEntryPOST } from "@/app/api/v1/source-documents/route";
import { getTestDb } from "../../setup";
import {
  serviceCredentials,
  sourceDocumentRevisions,
  sourceDocuments,
  ledgers,
} from "@/persistence";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
  getServiceCredentialsAction,
  getLedgerSettingsAction,
} from "@/modules/ledger/actions";
import { getDateInTimezone } from "@/lib/date-utils";
import { ValidationError } from "@/lib/errors";
import { authenticateToken } from "@/lib/security/service-credential-token";

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

// Mock Processing
vi.mock("@/lib/processing", () => ({
  createProcessingTask: vi.fn(),
  createTask: vi.fn(),
}));

const { submitMock } = vi.hoisted(() => ({
  submitMock: vi.fn().mockResolvedValue("mock-task-id"),
}));

// Mock Task Runtime
vi.mock("@/lib/tasks", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    submitTask: submitMock,
  };
});

// Mock Tasks
vi.mock("@/application/adapters/in-process/parse-source-document-task", () => ({
  TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
  parseSourceDocumentTaskDefinition: {
    type: "parse_source_document",
    handler: {
      execute: vi.fn(),
    },
  },
}));

describe("Service Credentials & Ledger Entry Ingestion", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();

    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      "API Test Ledger",
      TEST_USER_ID
    );
    testLedgerId = ledgerId;
  });

  it("should create and list service credentials via Actions", async () => {
    // Create Credential - returns data with one-time token
    const createRes = await createServiceCredentialAction(testLedgerId, {
      name: "Test Credential",
    });

    expect(createRes).toBeDefined();
    expect(createRes.token).toBeDefined();
    expect(createRes.tokenPrefix).toBeDefined();
    expect(createRes.tokenSuffix).toBeDefined();
    expect(createRes.name).toBe("Test Credential");

    // The token should match the expected format
    expect(createRes.token).toMatch(/^sk_live_[0-9a-f]{48}$/);

    // Verify hash is stored, not plaintext
    const db = getTestDb();
    const stored = await db.query.serviceCredentials.findFirst({
      where: eq(serviceCredentials.id, createRes.id),
    });
    expect(stored?.tokenHash).toBeDefined();
    expect(stored).not.toHaveProperty("key");
    expect(authenticateToken(createRes.token, stored?.tokenHash ?? "")).toBe(true);

    // List Credentials
    const listRes = await getServiceCredentialsAction(testLedgerId);
    const listedCredential = requireFirst(listRes, "service credential");

    expect(listRes).toHaveLength(1);
    expect(listedCredential.id).toBe(createRes.id);
    // List should not include the full token
    expect((listedCredential as Record<string, unknown>).key).toBeUndefined();
    expect((listedCredential as Record<string, unknown>).token).toBeUndefined();
    // List should include prefix/suffix
    expect(listedCredential.tokenPrefix).toBe(createRes.tokenPrefix);
    expect(listedCredential.tokenSuffix).toBe(createRes.tokenSuffix);
  });

  it("rejects blank credential name with ValidationError", async () => {
    await expect(
      createServiceCredentialAction(testLedgerId, { name: "" } as never)
    ).rejects.toThrow(ValidationError);
  });

  it("rejects invalid credential id with ValidationError", async () => {
    await expect(deleteServiceCredentialAction(testLedgerId, "bad-id")).rejects.toThrow(
      ValidationError
    );
  });

  it("should ingest ledger entry with valid service credential", async () => {
    // Setup: create a hash-only credential with a known bearer token.
    const db = getTestDb();
    const knownToken = "sk_test_123";
    const { computeHash, prefixSuffix } = await import("@/lib/security/service-credential-token");
    const hash = computeHash(knownToken);
    const { prefix, suffix } = prefixSuffix(knownToken);
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Ingest Credential",
        tokenHash: hash,
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      })
      .returning();
    requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${knownToken}`,
      },
      body: JSON.stringify({ text: "API Ledger Entry" }),
    });

    const res = await ledgerEntryPOST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("queued");

    // Check DB
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, data.sourceDocumentId),
    });
    expect(doc).toBeDefined();
    expect(doc?.ledgerId).toBe(testLedgerId);
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.sourceDocumentId, data.sourceDocumentId),
    });
    expect(revision?.submittedText).toBe("API Ledger Entry");
    expect(["queued", "processing"]).toContain(revision?.outcome);
  });

  it("should reject ledger entry with invalid service credential", async () => {
    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer invalid_key`,
      },
      body: JSON.stringify({ text: "API Ledger Entry" }),
    });

    const res = await ledgerEntryPOST(req);
    expect(res.status).toBe(401);
  });

  it("should reject invalid JSON body", async () => {
    const db = getTestDb();
    const knownToken = "sk_invalid_json";
    const { computeHash, prefixSuffix } = await import("@/lib/security/service-credential-token");
    const hash = computeHash(knownToken);
    const { prefix, suffix } = prefixSuffix(knownToken);
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Broken Body Credential",
        tokenHash: hash,
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      })
      .returning();
    requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${knownToken}`,
        "Content-Type": "application/json",
      },
      body: "{",
    });

    const res = await ledgerEntryPOST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("should derive entryDate from timezone when entryDate is omitted", async () => {
    const db = getTestDb();
    const knownToken = "sk_timezone";
    const { computeHash, prefixSuffix } = await import("@/lib/security/service-credential-token");
    const hash = computeHash(knownToken);
    const { prefix, suffix } = prefixSuffix(knownToken);
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Timezone Credential",
        tokenHash: hash,
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      })
      .returning();
    requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${knownToken}`,
      },
      body: JSON.stringify({ text: "Timezone Entry", timezone: "UTC" }),
    });

    const res = await ledgerEntryPOST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, data.sourceDocumentId),
    });

    expect(doc?.entryDate).toBe(getDateInTimezone("UTC"));
  });

  it("should delete service credential via Action", async () => {
    const db = getTestDb();
    // Create credential via action to get proper hash
    const createRes = await createServiceCredentialAction(testLedgerId, {
      name: "Delete Credential",
    });

    // deleteServiceCredentialAction returns void
    await deleteServiceCredentialAction(testLedgerId, createRes.id);

    const check = await db.query.serviceCredentials.findFirst({
      where: eq(serviceCredentials.id, createRes.id),
    });
    expect(check).toBeDefined();
    expect(check?.deletedAt).not.toBeNull();
  });

  it("tracks last use and rejects authentication immediately after revoke", async () => {
    const db = getTestDb();
    const credential = await createServiceCredentialAction(testLedgerId, {
      name: "Lifecycle Credential",
    });
    const firstResponse = await ledgerEntryPOST(
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.token}`,
          "Idempotency-Key": "credential-lifecycle-record",
        },
        body: JSON.stringify({ text: "Persist before revoke" }),
      })
    );
    const created = await firstResponse.json();
    expect(firstResponse.status).toBe(201);
    const usedCredential = await db.query.serviceCredentials.findFirst({
      where: eq(serviceCredentials.id, credential.id),
    });
    expect(usedCredential?.lastUsedAt).toBeInstanceOf(Date);

    await deleteServiceCredentialAction(testLedgerId, credential.id);
    const revokedResponse = await ledgerEntryPOST(
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.token}` },
        body: JSON.stringify({ text: "Must be rejected" }),
      })
    );
    expect(revokedResponse.status).toBe(401);
    expect(
      await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, created.sourceDocumentId),
      })
    ).toBeDefined();
  });

  it("should return credentials with prefix/suffix via getLedgerSettingsAction", async () => {
    // Create a credential via action to get proper hash-based credential
    const created = await createServiceCredentialAction(testLedgerId, {
      name: "New Credential",
    });

    // Get settings via getLedgerSettingsAction
    const settings = await getLedgerSettingsAction(testLedgerId);
    const settingsCredential = requireFirst(settings.credentials, "settings credential");

    expect(settings.credentials).toHaveLength(1);
    expect(settingsCredential.name).toBe("New Credential");
    // The credential should have prefix/suffix, not full key
    expect(settingsCredential.tokenPrefix).toBe(created.tokenPrefix);
    expect(settingsCredential.tokenSuffix).toBe(created.tokenSuffix);
    expect((settingsCredential as Record<string, unknown>).key).toBeUndefined();
  });
});
