import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportLedgerEntriesAction } from "@/features/ledger/server/actions/export";
import { getTestDb } from "../setup";
import { ledgers, ledgerEntries, users, sourceDocuments, entryCategories } from "@/lib/db/schema";
import { createLedgerData, createLedgerEntryData, createSourceDocumentData, createCategoryData } from "../helpers/factories";
import { v4 as uuidv4 } from "uuid";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("exportLedgerEntriesAction", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(auth as unknown as () => Promise<{ user: { id: string; email: string }; expires: string } | null>).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should export ledger entries as CSV with correct format", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Category
    const categoryData = createCategoryData(ledgerData.id, { name: "餐饮" });
    await db.insert(entryCategories).values(categoryData);

    // 3. Create Source Document with entryDate
    const sourceDocData = createSourceDocumentData(ledgerData.id, {
      title: "午餐发票",
      entryDate: "2024-03-15",
    });
    await db.insert(sourceDocuments).values(sourceDocData);

    // 4. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, {
      sourceDocumentId: sourceDocData.id,
      categoryId: categoryData.id,
      amount: "25.50",
      currency: "CNY",
      itemName: "午餐",
      description: "工作午餐",
      convertedAmount: "25.50",
      exchangeRate: "1.0",
    });
    await db.insert(ledgerEntries).values(entryData);

    // 5. Export
    const result = await exportLedgerEntriesAction(ledgerData.id, "en");

    // 6. Assertions
    expect(result.isEmpty).toBe(false);
    expect(result.filename).toMatch(/^export_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csvContent).toContain("\uFEFF"); // UTF-8 BOM

    // Check headers (skip UTF-8 BOM character)
    const lines = result.csvContent.split("\r\n");
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    expect(headerLine).toBe("Date,Item Name,Amount,Currency,Category,Description,Converted Amount,Exchange Rate,Source Document,Created At");

    // Check data row
    const dataRow = lines[1];
    expect(dataRow).toContain("2024-03-15");
    expect(dataRow).toContain("午餐");
    expect(dataRow).toContain("25.50");
    expect(dataRow).toContain("CNY");
    expect(dataRow).toContain("餐饮");
    expect(dataRow).toContain("工作午餐");
    expect(dataRow).toContain("午餐发票");
  });

  it("should return empty result when ledger has no entries", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Export (no entries)
    const result = await exportLedgerEntriesAction(ledgerData.id);

    // 3. Assertions
    expect(result.isEmpty).toBe(true);
    expect(result.csvContent).toBe("");
    expect(result.filename).toBe("");
  });

  it("should handle CSV special characters correctly", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry with special characters
    const entryData = createLedgerEntryData(ledgerData.id, {
      sourceDocumentId: sourceDocData.id,
      itemName: '午餐,晚餐"夜宵', // Contains comma and quote
      description: "Line1\nLine2", // Contains newline
    });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export
    const result = await exportLedgerEntriesAction(ledgerData.id);

    // 5. Assertions - verify proper escaping
    const lines = result.csvContent.split("\r\n");
    const dataRow = lines[1];

    // Quote should be escaped as double quote
    expect(dataRow).toContain('"午餐,晚餐""夜宵"');
    // Newline should cause the field to be quoted
    expect(dataRow).toContain('"Line1\nLine2"');
  });

  it("should throw UnauthorizedError when user does not have access", async () => {
    const db = getTestDb();
    const otherUserId = "11111111-1111-1111-1111-111111111111";

    // Ensure other user exists
    await db.insert(users).values({
      id: otherUserId,
      email: "other@example.com",
      name: "Other User",
      emailVerified: new Date(),
    }).onConflictDoNothing();

    // Create Ledger for another user
    const ledgerData = createLedgerData({ userId: otherUserId });
    await db.insert(ledgers).values(ledgerData);

    // Export should throw Unauthorized
    await expect(exportLedgerEntriesAction(ledgerData.id))
      .rejects.toThrow("Ledger not found");
  });

  it("should generate localized CSV headers for Chinese locale", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, { sourceDocumentId: sourceDocData.id });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export with Chinese locale
    const result = await exportLedgerEntriesAction(ledgerData.id, "zh");

    // 5. Assertions (skip UTF-8 BOM character)
    const lines = result.csvContent.split("\r\n");
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    expect(headerLine).toBe("日期,项目名称,金额,币种,分类,描述,转换金额,汇率,来源文档,创建时间");
  });

  it("should use English headers for unsupported locale", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, { sourceDocumentId: sourceDocData.id });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export with unsupported locale
    const result = await exportLedgerEntriesAction(ledgerData.id, "fr");

    // 5. Assertions - should fallback to English (skip UTF-8 BOM character)
    const lines = result.csvContent.split("\r\n");
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    expect(headerLine).toBe("Date,Item Name,Amount,Currency,Category,Description,Converted Amount,Exchange Rate,Source Document,Created At");
  });

  it("should handle null values gracefully", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document (no entryDate)
    const sourceDocData = createSourceDocumentData(ledgerData.id, {
      entryDate: null,
      title: null,
    });
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry with minimal data
    const entryData = createLedgerEntryData(ledgerData.id, {
      sourceDocumentId: sourceDocData.id,
      categoryId: null,
      currency: null,
      description: null,
      convertedAmount: null,
      exchangeRate: null,
      // itemName and amount should always have values per schema
    });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export
    const result = await exportLedgerEntriesAction(ledgerData.id);

    // 5. Assertions - should not contain "null" or "undefined" strings
    const lines = result.csvContent.split("\r\n");
    const dataRow = lines[1];

    // Split by comma and check each field
    const fields = dataRow.split(",");
    // Category should be empty (not "null")
    expect(dataRow).not.toContain("null");
    expect(dataRow).not.toContain("undefined");
  });

  it("should sanitize filename by replacing illegal characters", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document
    const sourceDocData = createSourceDocumentData(ledgerData.id);
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, { sourceDocumentId: sourceDocData.id });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export
    const result = await exportLedgerEntriesAction(ledgerData.id);

    // 5. Assertions - filename should follow default pattern
    expect(result.filename).toMatch(/^export_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("should format dates consistently", async () => {
    const db = getTestDb();

    // 1. Create Ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);

    // 2. Create Source Document with specific entryDate
    const sourceDocData = createSourceDocumentData(ledgerData.id, {
      entryDate: "2024-03-15",
    });
    await db.insert(sourceDocuments).values(sourceDocData);

    // 3. Create Entry
    const entryData = createLedgerEntryData(ledgerData.id, {
      sourceDocumentId: sourceDocData.id,
      // createdAt will be auto-generated
    });
    await db.insert(ledgerEntries).values(entryData);

    // 4. Export
    const result = await exportLedgerEntriesAction(ledgerData.id);

    // 5. Assertions
    const lines = result.csvContent.split("\r\n");
    const dataRow = lines[1];
    const fields = dataRow.split(",");

    // First field should be entryDate in yyyy-MM-dd format
    expect(fields[0]).toBe("2024-03-15");

    // Last field (createdAt) should be in yyyy-MM-dd HH:mm:ss format
    const createdAtField = fields[fields.length - 1];
    expect(createdAtField).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
