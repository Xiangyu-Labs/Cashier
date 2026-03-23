import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as ledgerEntryPOST } from "@/app/api/v1/source-documents/route";
import { getTestDb } from "../../setup";
import { serviceCredentials, sourceDocuments, ledgers } from "@/persistence";
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

// Mock Flow Engine
vi.mock("@/lib/flow", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    submitFlowTask: submitMock,
  };
});

// Mock Tasks
vi.mock("@/modules/source-document/application/tasks/parse-source-document", () => ({
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
    // Create Credential - new format returns data directly
    const createRes = await createServiceCredentialAction(testLedgerId, {
      name: "Test Credential",
    });

    expect(createRes).toBeDefined();
    expect(createRes.key).toBeDefined();
    expect(createRes.name).toBe("Test Credential");

    // List Credentials
    const listRes = await getServiceCredentialsAction(testLedgerId);
    const listedCredential = requireFirst(listRes, "service credential");

    expect(listRes).toHaveLength(1);
    expect(listedCredential.id).toBe(createRes.id);
  });

  it("rejects blank credential name with ValidationError", async () => {
    await expect(createServiceCredentialAction(testLedgerId, { name: "" } as never)).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects invalid credential id with ValidationError", async () => {
    await expect(deleteServiceCredentialAction(testLedgerId, "bad-id")).rejects.toThrow(
      ValidationError
    );
  });

  it("should ingest ledger entry with valid service credential", async () => {
    // Setup: create a credential first
    const db = getTestDb();
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Ingest Credential",
        key: "sk_test_123",
      })
      .returning();
    const c = requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.key}`,
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
    expect(doc?.text).toBe("API Ledger Entry");
    expect(doc?.ledgerId).toBe(testLedgerId);
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
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Broken Body Credential",
        key: "sk_invalid_json",
      })
      .returning();
    const credential = requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.key}`,
        "Content-Type": "application/json",
      },
      body: "{",
    });

    const res = await ledgerEntryPOST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("should derive entryDate from timezone when entryDate is omitted", async () => {
    const db = getTestDb();
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Timezone Credential",
        key: "sk_timezone",
      })
      .returning();
    const credential = requireFirst(createdCredentials, "service credential");

    const req = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.key}`,
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
    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Delete Credential",
        key: "sk_delete_123",
      })
      .returning();
    const c = requireFirst(createdCredentials, "service credential");

    // deleteServiceCredentialAction returns void in new format
    await deleteServiceCredentialAction(testLedgerId, c.id);

    const check = await db.query.serviceCredentials.findFirst({
      where: eq(serviceCredentials.id, c.id),
    });
    expect(check).toBeDefined();
    expect(check?.deletedAt).not.toBeNull();
  });

  it("should return credentials with key via getLedgerSettingsAction", async () => {
    const db = getTestDb();
    // Insert an existing credential (simulating old credential)
    await db
      .insert(serviceCredentials)
      .values({
        ledgerId: testLedgerId,
        name: "Old Existing Credential",
        key: "sk_live_existing_key_for_testing",
      })
      .returning();

    // Get settings via getLedgerSettingsAction
    const settings = await getLedgerSettingsAction(testLedgerId);
    const settingsCredential = requireFirst(settings.credentials, "settings credential");

    expect(settings.credentials).toHaveLength(1);
    expect(settingsCredential.name).toBe("Old Existing Credential");
    // This is the critical test - the key must be returned
    expect(settingsCredential.key).toBe("sk_live_existing_key_for_testing");
  });
});
