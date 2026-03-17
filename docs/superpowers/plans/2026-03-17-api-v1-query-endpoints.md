# API v1 查询端点实现计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为高阶用户添加 4 个只读查询 API：entries、source-documents、stats、categories

**Architecture:** 复用现有的 Server Actions 逻辑，在 API 路由层做轻量包装，保持与 Web UI 展示的数据字段完全一致。所有端点使用相同的 Service Credential 认证和限流机制。

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Zod

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/app/api/v1/entries/route.ts` | GET /api/v1/entries - 账本条目查询 |
| `src/app/api/v1/source-documents/route.ts` | 修改现有文件，添加 GET 方法 |
| `src/app/api/v1/stats/route.ts` | GET /api/v1/stats - 收支统计查询 |
| `src/app/api/v1/categories/route.ts` | GET /api/v1/categories - 分类列表查询 |
| `tests/integration/api/v1-query-endpoints.test.ts` | 集成测试 |

---

## Chunk 1: API v1 查询端点实现

### Task 1: GET /api/v1/entries 端点

**Files:**
- Create: `src/app/api/v1/entries/route.ts`
- Test: `tests/integration/api/v1-query-endpoints.test.ts`

**依赖:** 无（复用现有 Server Actions）

- [ ] **Step 1: 创建 entries API 路由文件**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, ValidationError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    // 1. 认证
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);
    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. 限流
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. 解析查询参数
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      currency: searchParams.get("currency") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    // 4. 查询数据
    const result = await getLedgerEntriesAction(credential.ledgerId, {
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      categoryId: params.categoryId ?? null,
      currency: params.currency ?? null,
      limit: params.limit,
      cursor: params.cursor ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("api/v1/entries", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
```

- [ ] **Step 2: 创建目录并保存文件**

```bash
mkdir -p src/app/api/v1/entries
git add src/app/api/v1/entries/route.ts
```

- [ ] **Step 3: 验证类型检查通过**

```bash
npx tsc --noEmit --skipLibCheck src/app/api/v1/entries/route.ts
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add GET /api/v1/entries endpoint"
```

---

### Task 2: GET /api/v1/source-documents 列表端点

**Files:**
- Modify: `src/app/api/v1/source-documents/route.ts`

**依赖:** Task 1（复用相同的认证/限流模式）

- [ ] **Step 1: 读取现有文件**

```bash
cat src/app/api/v1/source-documents/route.ts
```

- [ ] **Step 2: 在现有文件中添加 GET 方法**

在文件末尾添加（保持原有的 POST 方法不变）：

```typescript
// 在文件顶部添加导入
import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";

// 在文件末尾添加 schema 和 GET 处理器
const listQuerySchema = z.object({
  status: z.enum(["queued", "processing", "completed", "anomaly", "failed"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  includeEntries: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: NextRequest) {
  try {
    // 1. 认证
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);
    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. 限流
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. 解析查询参数
    const { searchParams } = new URL(request.url);
    const params = listQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      includeEntries: searchParams.get("includeEntries") ?? "false",
    });

    // 4. 查询数据
    const result = await getSourceDocumentsAction(credential.ledgerId, {
      status: params.status ?? null,
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      cursor: params.cursor ?? null,
      limit: params.limit,
      includeLedgerEntries: params.includeEntries === "true",
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("api/v1/source-documents:GET", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
```

- [ ] **Step 3: 验证类型检查通过**

```bash
npx tsc --noEmit --skipLibCheck src/app/api/v1/source-documents/route.ts
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/source-documents/route.ts
git commit -m "feat(api): add GET method to /api/v1/source-documents endpoint"
```

---

### Task 3: GET /api/v1/stats 统计端点

**Files:**
- Create: `src/app/api/v1/stats/route.ts`

**依赖:** Task 1

- [ ] **Step 1: 创建 stats API 路由文件**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, ValidationError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
});

export async function GET(request: NextRequest) {
  try {
    // 1. 认证
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);
    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. 限流
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. 解析查询参数
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      currency: searchParams.get("currency") ?? undefined,
    });

    // 4. 查询统计数据
    const result = await getLedgerStatsAction(
      credential.ledgerId,
      params.startDate,
      params.endDate,
      undefined, // mainCurrency - 使用账本默认
      {
        categoryId: params.categoryId ?? null,
        currency: params.currency ?? null,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    logError("api/v1/stats", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
```

- [ ] **Step 2: 创建目录并保存文件**

```bash
mkdir -p src/app/api/v1/stats
git add src/app/api/v1/stats/route.ts
```

- [ ] **Step 3: 验证类型检查通过**

```bash
npx tsc --noEmit --skipLibCheck src/app/api/v1/stats/route.ts
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add GET /api/v1/stats endpoint"
```

---

### Task 4: GET /api/v1/categories 分类列表端点

**Files:**
- Create: `src/app/api/v1/categories/route.ts`

**依赖:** Task 1

- [ ] **Step 1: 创建 categories API 路由文件**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

export async function GET(request: NextRequest) {
  try {
    // 1. 认证
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);
    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. 限流
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. 查询分类列表
    const categories = await getEntryCategoriesAction(credential.ledgerId);

    return NextResponse.json({ categories });
  } catch (error) {
    logError("api/v1/categories", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
```

- [ ] **Step 2: 创建目录并保存文件**

```bash
mkdir -p src/app/api/v1/categories
git add src/app/api/v1/categories/route.ts
```

- [ ] **Step 3: 验证类型检查通过**

```bash
npx tsc --noEmit --skipLibCheck src/app/api/v1/categories/route.ts
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add GET /api/v1/categories endpoint"
```

---

### Task 5: 集成测试

**Files:**
- Create: `tests/integration/api/v1-query-endpoints.test.ts`

**依赖:** Task 1-4

- [ ] **Step 1: 创建集成测试文件**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createTestLedger, createTestCategory, createTestCredential } from "@/tests/fixtures/ledger";
import { createTestSourceDocument } from "@/tests/fixtures/source-document";
import { createTestLedgerEntry } from "@/tests/fixtures/ledger-entry";

describe("API v1 Query Endpoints", () => {
  let ledgerId: string;
  let apiKey: string;
  let categoryId: string;
  let sourceDocId: string;

  beforeAll(async () => {
    // 创建测试账本
    ledgerId = await createTestLedger();

    // 创建 API 凭证
    const credential = await createTestCredential(ledgerId);
    apiKey = credential.key;

    // 创建测试分类
    const category = await createTestCategory(ledgerId);
    categoryId = category.id;

    // 创建测试单据和条目
    const doc = await createTestSourceDocument(ledgerId, { status: "completed" });
    sourceDocId = doc.id;

    await createTestLedgerEntry(ledgerId, {
      sourceDocumentId: sourceDocId,
      categoryId,
      amount: "100.00",
      currency: "CNY",
    });
  });

  describe("GET /api/v1/entries", () => {
    it("should return entries with valid credentials", async () => {
      const response = await fetch(
        `http://localhost:3000/api/v1/entries?limit=10`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    it("should filter by date range", async () => {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch(
        `http://localhost:3000/api/v1/entries?startDate=${today}&endDate=${today}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
    });

    it("should return 401 without auth header", async () => {
      const response = await fetch(`http://localhost:3000/api/v1/entries`);
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid key", async () => {
      const response = await fetch(`http://localhost:3000/api/v1/entries`, {
        headers: { Authorization: "Bearer invalid_key" },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/source-documents", () => {
    it("should return source documents list", async () => {
      const response = await fetch(
        `http://localhost:3000/api/v1/source-documents?limit=10`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toBeDefined();
    });

    it("should filter by status", async () => {
      const response = await fetch(
        `http://localhost:3000/api/v1/source-documents?status=completed`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/v1/stats", () => {
    it("should return stats summary", async () => {
      const response = await fetch(
        `http://localhost:3000/api/v1/stats`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.convertedTotal).toBeDefined();
      expect(data.totals).toBeDefined();
      expect(data.trend).toBeDefined();
    });
  });

  describe("GET /api/v1/categories", () => {
    it("should return categories list", async () => {
      const response = await fetch(
        `http://localhost:3000/api/v1/categories`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.categories).toBeDefined();
      expect(Array.isArray(data.categories)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 验证测试文件类型检查**

```bash
npx tsc --noEmit --skipLibCheck tests/integration/api/v1-query-endpoints.test.ts
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api/v1-query-endpoints.test.ts
git commit -m "test(api): add integration tests for v1 query endpoints"
```

---

### Task 6: 手动测试验证

**依赖:** Task 1-4

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev &
sleep 5
```

- [ ] **Step 2: 在 UI 中创建 Service Credential**

1. 访问 http://localhost:3000
2. 登录后进入 Settings → API Keys
3. 创建一个新的 Service Credential，记录下 key

- [ ] **Step 3: 测试 entries 端点**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/entries?limit=5"
```

Expected: 返回 JSON 格式的 entries 列表

- [ ] **Step 4: 测试 source-documents 端点**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/source-documents?limit=5"
```

Expected: 返回 JSON 格式的 source documents 列表

- [ ] **Step 5: 测试 stats 端点**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/stats"
```

Expected: 返回 JSON 格式的统计数据

- [ ] **Step 6: 测试 categories 端点**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/categories"
```

Expected: 返回 JSON 格式的分类列表

- [ ] **Step 7: 测试错误处理（无认证）**

```bash
curl -i "http://localhost:3000/api/v1/entries"
```

Expected: 返回 401 状态码

- [ ] **Step 8: 停止开发服务器**

```bash
pkill -f "next dev" || true
```

- [ ] **Step 9: Commit（如有变更）**

```bash
git diff --quiet || git commit -m "chore(api): verify endpoints manually"
```

---

## 实现检查清单

### 所有端点遵循的规范

| 规范 | 实现 |
|------|------|
| 认证 | Bearer Token via `Authorization` header |
| 认证验证 | `validateServiceCredential()` |
| 限流 | `rateLimitApiV1()` - 20 req/min per key |
| 错误格式 | `{ code, message, details? }` via `toErrorResponse()` |
| 日期格式 | `yyyy-MM-dd` 字符串 |
| 分页 | cursor-based，返回 `nextCursor` |
| 数据字段 | 与 Web UI 展示字段完全一致 |

### 端点汇总

| 方法 | 端点 | 描述 | 查询参数 |
|------|------|------|----------|
| GET | `/api/v1/entries` | 账本条目查询 | startDate, endDate, categoryId, currency, cursor, limit |
| GET | `/api/v1/source-documents` | 原始单据列表 | status, startDate, endDate, cursor, limit, includeEntries |
| GET | `/api/v1/stats` | 收支统计 | startDate, endDate, categoryId, currency |
| GET | `/api/v1/categories` | 分类列表 | 无 |
| POST | `/api/v1/source-documents` | 上传单据（已有） | text, images, entryDate, timezone |

---

## 验收标准

- [ ] 所有 4 个 GET 端点返回 200 并返回正确格式的 JSON
- [ ] 未认证请求返回 401
- [ ] 无效参数返回 400 并包含验证错误详情
- [ ] 返回的数据字段与 Web UI 展示一致（无额外内部字段）
- [ ] 集成测试通过
- [ ] 代码通过 TypeScript 类型检查
