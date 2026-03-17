import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import { getSourceDocumentLightAction } from "@/features/source-document/server/actions/get-document-light";
import { getTestDb } from "../setup";
import { ledgers, sourceDocuments, users, ledgerEntries, entryCategories } from "@/lib/db/schema";
import {
  createLedgerData,
  createSourceDocumentData,
  createCategoryData,
  createLedgerEntryData,
} from "../helpers/factories";
import { v4 as uuidv4 } from "uuid";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("getSourceDocumentByIdAction", () => {
  // const db = getTestDb();
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should return the source document when it exists and user has access", async () => {
    const db = getTestDb();
    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const docData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(docData);

    // 3. Action
    const result = await getSourceDocumentByIdAction(docData.id);

    // 4. Assertion - new format returns data directly
    expect(result).not.toBeNull();
    expect(result!.id).toBe(docData.id);
    expect(result!.ledgerId).toBe(ledgerData.id);
    // Verify date serialization
    expect(typeof result!.createdAt).toBe("string");
  });

  it("should return null when document does not exist", async () => {
    const result = await getSourceDocumentByIdAction(uuidv4());
    expect(result).toBeNull();
  });

  it("should return null when user does not have access to the ledger", async () => {
    const db = getTestDb();
    // 1. Create Ledger for ANOTHER user
    const otherUserId = "22222222-2222-2222-2222-222222222222";
    await db
      .insert(users)
      .values({
        id: otherUserId,
        email: "other2@example.com",
        name: "Other User 2",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const ledgerData = createLedgerData({ userId: otherUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const docData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(docData);

    // 3. Action - returns null to avoid leaking document existence
    const result = await getSourceDocumentByIdAction(docData.id);
    expect(result).toBeNull();
  });
});

describe("getSourceDocumentLightAction", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should return source document with basic data", async () => {
    const db = getTestDb();
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    const docData = createSourceDocumentData(ledgerData.id, {
      title: "Test Receipt",
      text: "Lunch for 25.50",
    });
    await db.insert(sourceDocuments).values(docData);

    const result = await getSourceDocumentLightAction(docData.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(docData.id);
    expect(result!.ledgerId).toBe(ledgerData.id);
    expect(result!.title).toBe("Test Receipt");
    expect(result!.text).toBe("Lunch for 25.50");
    expect(typeof result!.createdAt).toBe("string");
  });

  it("should exclude imageUrls from response", async () => {
    const db = getTestDb();
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    const docData = createSourceDocumentData(ledgerData.id, {
      imageUrls: ["data:image/jpeg;base64,/9j/4AAQ..."],
    });
    await db.insert(sourceDocuments).values(docData);

    const result = await getSourceDocumentLightAction(docData.id);

    expect(result).not.toBeNull();
    expect(result!.hasImages).toBe(true);
    expect((result as unknown as { imageUrls?: string[] }).imageUrls).toBeUndefined();
  });

  it("should hasImages should be false when no images", async () => {
    const db = getTestDb();
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    const docData = createSourceDocumentData(ledgerData.id, { imageUrls: [] });
    await db.insert(sourceDocuments).values(docData);

    const result = await getSourceDocumentLightAction(docData.id);

    expect(result).not.toBeNull();
    expect(result!.hasImages).toBe(false);
  });

  it("should exclude sensitive metadata fields", async () => {
    const db = getTestDb();
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    const docData = createSourceDocumentData(ledgerData.id, {
      metadata: {
        visionDescription: "sensitive-vision-data",
        normalField: "should-be-included",
      },
    });
    await db.insert(sourceDocuments).values(docData);

    const result = await getSourceDocumentLightAction(docData.id);

    expect(result).not.toBeNull();
    expect(result!.metadata).not.toHaveProperty("visionDescription");
    expect(result!.metadata).toHaveProperty("normalField", "should-be-included");
  });

  it("should include associated ledgerEntries", async () => {
    const db = getTestDb();
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    const categoryData = createCategoryData(ledgerData.id);
    await db.insert(entryCategories).values(categoryData);

    const docData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(docData);

    const entryData = createLedgerEntryData(ledgerData.id, {
      sourceDocumentId: docData.id,
      categoryId: categoryData.id,
      itemName: "Test Entry",
    });
    await db.insert(ledgerEntries).values(entryData);

    const result = await getSourceDocumentLightAction(docData.id);

    expect(result).not.toBeNull();
    expect(result!.ledgerEntries).toHaveLength(1);
    expect(result!.ledgerEntries[0].itemName).toBe("Test Entry");
    expect(result!.ledgerEntries[0].category?.name).toBe(categoryData.name);
  });

  it("should return null when document does not exist", async () => {
    const result = await getSourceDocumentLightAction(uuidv4());
    expect(result).toBeNull();
  });

  it("should return null when user does not have access", async () => {
    const db = getTestDb();
    const otherUserId = "33333333-3333-3333-3333-333333333333";
    await db
      .insert(users)
      .values({
        id: otherUserId,
        email: "other3@example.com",
        name: "Other User 3",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const ledgerData = createLedgerData({ userId: otherUserId });
    await db.insert(ledgers).values(ledgerData);

    const docData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(docData);

    const result = await getSourceDocumentLightAction(docData.id);
    expect(result).toBeNull();
  });
});
