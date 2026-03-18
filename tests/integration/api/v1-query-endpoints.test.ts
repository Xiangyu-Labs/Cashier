import { describe, it, expect, beforeEach } from "vitest";
import { type NextRequest } from "next/server";
import { GET as entriesGET } from "@/app/api/v1/entries/route";
import { GET as sourceDocumentsGET } from "@/app/api/v1/source-documents/route";
import { GET as statsGET } from "@/app/api/v1/stats/route";
import { GET as categoriesGET } from "@/app/api/v1/categories/route";
import { GET as taskItemsGET } from "@/app/api/v1/task/items/route";
import { GET as taskStatsGET } from "@/app/api/v1/task/stats/route";
import * as rateLimitModule from "@/lib/ratelimit";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import {
  serviceCredentials,
  ledgerEntries,
  sourceDocuments,
  ledgers,
  entryCategories,
  taskRuns,
} from "@/persistence";
import { vi, afterEach } from "vitest";
import * as authModule from "@/auth";

// Helper to create a mock NextRequest
function createMockRequest(
  url: string,
  options: { headers?: Record<string, string> } = {}
): NextRequest {
  const request = new Request(url, {
    headers: options.headers,
  }) as unknown as NextRequest;

  // Add the headers.get method that NextRequest expects
  Object.defineProperty(request, "headers", {
    value: {
      get: (name: string) => options.headers?.[name] ?? null,
    },
    writable: true,
    configurable: true,
  });

  return request as NextRequest;
}

describe("API v1 Query Endpoints", () => {
  let ledgerId: string;
  let apiKey: string;
  let categoryId: string;

  beforeEach(async () => {
    const db = getTestDb();

    // Clean up first - delete in reverse order to avoid FK constraints
    await db.delete(ledgerEntries);
    await db.delete(taskRuns);
    await db.delete(sourceDocuments);
    await db.delete(entryCategories);
    await db.delete(serviceCredentials);
    await db.delete(ledgers);

    // 创建测试账本 - 使用 TEST_USER_ID 确保与 auth mock 一致
    const result = await createTestUserWithLedger(db, undefined, undefined, TEST_USER_ID);
    ledgerId = result.ledgerId;

    // 创建 API 凭证 - 直接插入数据库避免 withLedgerAccess 权限检查
    const [credential] = await db
      .insert(serviceCredentials)
      .values({
        ledgerId,
        name: "Test API Key",
        key: `sk_test_${crypto.randomUUID().replace(/-/g, "")}`,
      })
      .returning();
    apiKey = credential.key;

    // 创建测试分类
    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "餐饮",
        description: "外卖、堂食",
        icon: "🍽️",
        sortOrder: 1,
      })
      .returning();
    categoryId = category.id;

    // 创建测试单据
    const today = new Date().toISOString().split("T")[0];
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "午餐花了100元",
        status: "completed",
        imageUrls: [],
        entryDate: today,
      })
      .returning();

    // 创建测试条目
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: doc.id,
      categoryId,
      amount: "100.00",
      currency: "CNY",
      itemName: "午餐",
      convertedAmount: "100.00",
      exchangeRate: "1.00",
    });

    const [anomalyDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        title: "异常单据",
        text: "识别失败",
        status: "anomaly",
        type: "ai_parsed",
        anomalyReason: "Could not parse",
        imageUrls: [],
      })
      .returning();

    await db.insert(taskRuns).values([
      {
        type: "parse_source_document",
        title: "Pending Task",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        type: "parse_source_document",
        title: "Running Task",
        status: "running",
        scopeId: ledgerId,
      },
      {
        type: "parse_source_document",
        title: "Failed Task",
        status: "failed",
        error: "Something went wrong",
        scopeId: ledgerId,
      },
      {
        type: "parse_source_document",
        title: "Completed Visible Task",
        status: "completed",
        scopeId: ledgerId,
        completedAt: new Date(),
        entityType: "source_document",
        entityId: doc.id,
        tokenUsage: { total: { input: 100, output: 50 } },
      },
      {
        type: "parse_source_document",
        title: "Completed Hidden Task",
        status: "completed",
        scopeId: ledgerId,
        completedAt: new Date(Date.now() - 1000),
        entityType: "source_document",
        entityId: anomalyDoc.id,
        tokenUsage: { total: { input: 200, output: 100 } },
      },
    ]);
  });

  describe("GET /api/v1/entries", () => {
    it("should work with a valid API key even without a user session", async () => {
      vi.spyOn(authModule, "auth").mockResolvedValue(null as never);

      const request = createMockRequest(`http://localhost:3000/api/v1/entries?limit=10`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await entriesGET(request);
      expect(response.status).toBe(200);
    });

    it("should return entries with valid credentials", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/entries?limit=10`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await entriesGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThan(0);
    });

    it("should filter by date range", async () => {
      const today = new Date().toISOString().split("T")[0];
      const request = createMockRequest(
        `http://localhost:3000/api/v1/entries?startDate=${today}&endDate=${today}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const response = await entriesGET(request);
      expect(response.status).toBe(200);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/entries`);

      const response = await entriesGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid key", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/entries`, {
        headers: { Authorization: "Bearer invalid_key" },
      });

      const response = await entriesGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid query params", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/entries?limit=0`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await entriesGET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(data.error.details.issues)).toBe(true);
    });

    it("should return 429 when rate limit is exceeded", async () => {
      vi.spyOn(rateLimitModule, "rateLimitApiV1").mockResolvedValue({
        success: false,
        remaining: 0,
        resetTime: Date.now(),
      });

      const request = createMockRequest(`http://localhost:3000/api/v1/entries`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await entriesGET(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error.code).toBe("RATE_LIMIT");
    });
  });

  describe("GET /api/v1/source-documents", () => {
    it("should return source documents list", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/source-documents?limit=10`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await sourceDocumentsGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.items).toBeDefined();
    });

    it("should filter by status", async () => {
      const request = createMockRequest(
        `http://localhost:3000/api/v1/source-documents?status=completed`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const response = await sourceDocumentsGET(request);
      expect(response.status).toBe(200);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/source-documents`);

      const response = await sourceDocumentsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid query params", async () => {
      const request = createMockRequest(
        `http://localhost:3000/api/v1/source-documents?limit=101`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      const response = await sourceDocumentsGET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(data.error.details.issues)).toBe(true);
    });
  });

  describe("GET /api/v1/stats", () => {
    it("should return stats summary", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/stats`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await statsGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.convertedTotal).toBeDefined();
      expect(data.totals).toBeDefined();
      expect(data.trend).toBeDefined();
    });

    it("should filter by date range", async () => {
      const today = new Date().toISOString().split("T")[0];
      const request = createMockRequest(
        `http://localhost:3000/api/v1/stats?startDate=${today}&endDate=${today}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const response = await statsGET(request);
      expect(response.status).toBe(200);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/stats`);

      const response = await statsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid query params", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/stats?currency=TOOLONG`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await statsGET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(data.error.details.issues)).toBe(true);
    });
  });

  describe("GET /api/v1/categories", () => {
    it("should return categories list", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/categories`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await categoriesGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.categories).toBeDefined();
      expect(Array.isArray(data.categories)).toBe(true);
      expect(data.categories.length).toBeGreaterThan(0);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/categories`);

      const response = await categoriesGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid key", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/categories`, {
        headers: { Authorization: "Bearer invalid_key" },
      });

      const response = await categoriesGET(request);
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/task/items", () => {
    it("should return task items with valid credentials", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/items`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await taskItemsGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.some((item: { status: string }) => item.status === "pending")).toBe(true);
      expect(data.items.some((item: { status: string }) => item.status === "running")).toBe(true);
      expect(data.items.some((item: { status: string }) => item.status === "failed")).toBe(true);
      expect(data.items.some((item: { kind: string }) => item.kind === "anomaly")).toBe(true);
      expect(data.items.some((item: { status: string }) => item.status === "completed")).toBe(true);
    });

    it("should not include completed tasks for anomaly source documents", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/items`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await taskItemsGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(
        data.items.some((item: { title: string }) => item.title === "Completed Hidden Task")
      ).toBe(false);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/items`);

      const response = await taskItemsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid key", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/items`, {
        headers: { Authorization: "Bearer invalid_key" },
      });

      const response = await taskItemsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 429 when rate limit is exceeded", async () => {
      vi.spyOn(rateLimitModule, "rateLimitApiV1").mockResolvedValue({
        success: false,
        remaining: 0,
        resetTime: Date.now(),
      });

      const request = createMockRequest(`http://localhost:3000/api/v1/task/items`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await taskItemsGET(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error.code).toBe("RATE_LIMIT");
    });
  });

  describe("GET /api/v1/task/stats", () => {
    it("should return task stats with valid credentials", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/stats`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await taskStatsGET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.stats.pendingCount).toBe(1);
      expect(data.stats.runningCount).toBe(1);
      expect(data.stats.failedCount).toBe(1);
      expect(data.stats.completedCount).toBe(2);
      expect(data.stats.anomalyCount).toBe(1);
      expect(data.stats.total).toBe(4);
      expect(data.stats.totalInputTokens).toBe(300);
      expect(data.stats.totalOutputTokens).toBe(150);
      expect(data.stats.avgTokensPerTask).toBe(225);
    });

    it("should return 401 without auth header", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/stats`);

      const response = await taskStatsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid key", async () => {
      const request = createMockRequest(`http://localhost:3000/api/v1/task/stats`, {
        headers: { Authorization: "Bearer invalid_key" },
      });

      const response = await taskStatsGET(request);
      expect(response.status).toBe(401);
    });

    it("should return 429 when rate limit is exceeded", async () => {
      vi.spyOn(rateLimitModule, "rateLimitApiV1").mockResolvedValue({
        success: false,
        remaining: 0,
        resetTime: Date.now(),
      });

      const request = createMockRequest(`http://localhost:3000/api/v1/task/stats`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const response = await taskStatsGET(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error.code).toBe("RATE_LIMIT");
    });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
