import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET, POST } from "@/app/api/v1/source-documents/route";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { ledgers, serviceCredentials, sourceDocuments } from "@/persistence";

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

vi.mock("@/modules/source-document/application/tasks/parse-source-document", () => ({
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

    const db = getTestDb();
    const created = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, data.sourceDocumentId),
    });
    expect(created?.ledgerId).toBe(ledgerId);
  });

  it("GET /api/v1/source-documents returns 200 for valid credential request", async () => {
    const db = getTestDb();
    const today = new Date().toISOString().split("T")[0];
    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        text: "Completed route document",
        status: "completed",
        imageUrls: [],
        entryDate: today,
      },
      {
        ledgerId,
        text: "Failed route document",
        status: "failed",
        imageUrls: [],
        entryDate: today,
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/v1/source-documents?status=completed&limit=1",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.status).toBe("completed");
    expect(data.items[0]?.text).toBeNull();
  });
});
