import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/v1/source-documents/route";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import {
  ledgers,
  processingOutbox,
  serviceCredentials,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

vi.mock("@/lib/processing", () => ({
  createProcessingTask: vi.fn(),
  createTask: vi.fn(),
}));

const { submitMock } = vi.hoisted(() => ({
  submitMock: vi.fn().mockResolvedValue("mock-task-id"),
}));

vi.mock("@/lib/tasks", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    submitTask: submitMock,
  };
});

vi.mock("@/application/adapters/in-process/parse-source-document-task", () => ({
  TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
  parseSourceDocumentTaskDefinition: {
    type: "parse_source_document",
    handler: {
      execute: vi.fn(),
    },
  },
}));

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

describe("API v1 source-documents route", () => {
  let ledgerId: string;
  let credentialKey: string;

  beforeEach(async () => {
    const db = getTestDb();

    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const setup = await createTestUserWithLedger(db, undefined, "Route Test Ledger", TEST_USER_ID);
    ledgerId = setup.ledgerId;

    const createdCredentials = await db
      .insert(serviceCredentials)
      .values({
        ledgerId,
        name: "Route Credential",
        key: `sk_route_${crypto.randomUUID().replace(/-/g, "")}`,
      })
      .returning();

    credentialKey = requireFirst(createdCredentials, "service credential").key;
  });

  it("POST /api/v1/source-documents returns 201 for valid credential request", async () => {
    const request = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentialKey}`,
      },
      body: JSON.stringify({ text: "Route API POST test document" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.status).toBe("queued");
    expect(data.revisionState).toBe("queued");
    expect(data.sourceDocumentId).toEqual(expect.any(String));
    expect(data.revisionId).toEqual(expect.any(String));

    const db = getTestDb();
    const created = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, data.sourceDocumentId),
    });
    expect(created?.ledgerId).toBe(ledgerId);
  });

  it("creates one document, revision, and processing intent for concurrent idempotent requests", async () => {
    const makeRequest = () =>
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
          "Idempotency-Key": "same-ingestion-request",
        },
        body: JSON.stringify({ text: "Concurrent API ingestion" }),
      });

    const [first, second] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);
    expect(secondBody).toEqual(firstBody);

    const db = getTestDb();
    const documents = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.ledgerId, ledgerId));
    const revisions = await db
      .select({ id: sourceDocumentRevisions.id })
      .from(sourceDocumentRevisions)
      .where(eq(sourceDocumentRevisions.sourceDocumentId, firstBody.sourceDocumentId));
    const intents = await db
      .select({ id: processingOutbox.id })
      .from(processingOutbox)
      .where(eq(processingOutbox.revisionId, firstBody.revisionId));
    expect(documents).toHaveLength(1);
    expect(revisions).toHaveLength(1);
    expect(intents).toHaveLength(1);
  });
});
