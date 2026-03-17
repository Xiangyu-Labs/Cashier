# 默认值统一与优化实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分散的硬编码默认值统一迁移到 .env 配置，优化不合理的默认值，提高可维护性和运维灵活性。

**Architecture:** 保持现有的三层配置架构（System/Runtime/Frontend），将 Runtime 配置项从代码常量迁移到环境变量，保持向后兼容（代码中使用 `process.env.XXX ?? 原常量值`）。

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, Sharp (image processing)

**约束:** maxTokens (8192) 保持不动，其余全部采纳建议值。

---

## 文件结构变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `.env.example` | 修改 | 添加新的 Runtime 配置项 |
| `src/lib/constants.ts` | 修改 | 更新常量值为读取环境变量 |
| `src/lib/storage/image-processing.ts` | 修改 | limitInputPixels 改为读取环境变量 |
| `src/lib/ratelimit.ts` | 修改 | API_V1 limit 改为读取环境变量 |
| `src/auth.ts` | 修改 | SESSION_MAX_AGE 改为读取环境变量 |
| `src/features/auth/server/services/otp-rate-limit.ts` | 修改 | IP/Verify 限流改为读取环境变量 |
| `src/features/ledger/server/actions/export.ts` | 修改 | export limit 改为读取环境变量 |

---

## Chunk 1: .env.example 配置扩展

### Task 1.1: 扩展 AI 配置区域

**Files:**
- Modify: `.env.example:71-76`

- [ ] **Step 1: 在 AI Models & Behavior 区域添加 temperature 配置**

```bash
# AI Models & Behavior
# -----------------------------------------------------------------------------
AI_MODEL_TEXT=gpt-4o-mini
AI_MODEL_VISION=gpt-4o
AI_MAX_RETRIES=3
AI_RETRY_DELAY_MS=1000

# AI 输出创造性参数 (0-2范围)，结构化任务建议 0.1-0.3
# 较低值提高 JSON 输出确定性和一致性
AI_TEMPERATURE=0.3
```

- [ ] **Step 2: 验证添加的配置**

检查 `.env.example` 第 71-80 行是否正确添加了 AI_TEMPERATURE。

---

### Task 1.2: 添加数据刷新策略配置

**Files:**
- Modify: `.env.example` (在 Task 1.1 之后)

- [ ] **Step 1: 在 AI 配置区域后添加 Data Refresh Strategy 区域**

```bash
# -----------------------------------------------------------------------------
# Data Refresh Strategy (TanStack Query staleTime)
# -----------------------------------------------------------------------------

# 源文档数据刷新间隔 (毫秒)
# 默认: 120000 (2分钟)，原值 30秒过于频繁
SOURCE_DOC_STALE_TIME_MS=120000

# 货币汇率数据刷新间隔 (毫秒)
# 默认: 14400000 (4小时)，原值 24小时对于汇率过长
CURRENCY_STALE_TIME_MS=14400000
```

- [ ] **Step 2: 验证区域添加**

检查 `.env.example` 是否新增了 Data Refresh Strategy 区域，包含两个配置项。

---

### Task 1.3: 添加 API 限流配置

**Files:**
- Modify: `.env.example` (在 OTP & Security Settings 区域后)

- [ ] **Step 1: 在 AUTH_RATE_LIMIT_WINDOW 后添加 API 限流配置**

```bash
# API v1 限流 (每分钟请求数)
# 默认: 60，原值 20/分钟对于集成场景过于严格
API_RATE_LIMIT_PER_MINUTE=60

# IP 级别 OTP 发送限流 (每小时每IP最大次数)
# 默认: 10
OTP_IP_MAX_ATTEMPTS_PER_HOUR=10

# OTP 验证限流 (每分钟每IP最大次数)
# 默认: 5，原值 10 过于宽松
OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE=5
```

- [ ] **Step 2: 验证 API 限流配置**

检查 `.env.example` 是否新增了 API 限流相关配置。

---

### Task 1.4: 添加导出限制配置

**Files:**
- Modify: `.env.example` (在 Task Queue 区域附近)

- [ ] **Step 1: 在 MAX_TASK_WORKER 后添加导出限制**

```bash
# 账本条目单次导出最大数量
# 默认: 2000，原值 10000 可能导致内存问题
# 超出此限制的数据应使用日期范围筛选或异步导出
EXPORT_MAX_ENTRIES=2000
```

- [ ] **Step 2: 验证导出限制配置**

---

### Task 1.5: 添加图片处理配置

**Files:**
- Modify: `.env.example` (新建区域)

- [ ] **Step 1: 在 Task Queue 区域后添加 Image Processing 区域**

```bash
# -----------------------------------------------------------------------------
# Image Processing
# -----------------------------------------------------------------------------

# 图片处理最大输入像素 (防止 OOM)
# 默认: 25000000 (2500万像素, ~5000x5000)
# 原值 100000000 (1亿像素) 可能导致内存问题
MAX_INPUT_PIXELS=25000000

# 图片处理质量 (1-100)
# 默认: 85，JPEG/WebP 压缩质量
MAX_IMAGE_QUALITY=85
```

- [ ] **Step 2: 验证图片处理配置**

---

### Task 1.6: 添加会话安全配置

**Files:**
- Modify: `.env.example` (在 OTP & Security Settings 区域)

- [ ] **Step 1: 在 OTP_RESEND_COOLDOWN_SECONDS 后添加会话配置**

```bash
# 用户会话有效期 (天)
# 默认: 14，原值 30天对于财务应用过长
# 增加会话劫持风险，建议 7-14 天
SESSION_MAX_AGE_DAYS=14
```

- [ ] **Step 2: 验证会话配置**

---

## Chunk 2: 代码修改 - Constants 文件

### Task 2.1: 更新 constants.ts - AI 配置

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: 添加 AI 常量对象**

在文件末尾（QUERY 常量后）添加 AI 配置常量：

```typescript
// AI Configuration
export const AI = {
  /** 默认 temperature - 结构化任务使用较低值提高确定性 */
  TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE ?? "0.3"),
} as const;
```

- [ ] **Step 2: 验证修改**

检查 `src/lib/constants.ts` 是否正确添加了 AI 常量对象。

---

### Task 2.2: 更新 constants.ts - 刷新策略

**Files:**
- Modify: `src/lib/constants.ts:76-86`

- [ ] **Step 1: 修改 QUERY 常量，读取环境变量**

```typescript
// Query cache configuration
export const QUERY = {
  /** 默认staleTime - 5分钟 */
  DEFAULT_STALE_TIME_MS: 5 * 60 * 1000,
  /** Ledger数据staleTime - 10分钟（较稳定） */
  LEDGER_STALE_TIME_MS: 10 * 60 * 1000,
  /** 源文档staleTime - 2分钟（频繁变化但避免过度刷新） */
  SOURCE_DOC_STALE_TIME_MS: parseInt(
    process.env.SOURCE_DOC_STALE_TIME_MS ?? "120000",
    10
  ),
  /** 货币汇率staleTime - 4小时（外部数据，工作日变化较快） */
  CURRENCY_STALE_TIME_MS: parseInt(
    process.env.CURRENCY_STALE_TIME_MS ?? "14400000",
    10
  ),
} as const;
```

- [ ] **Step 2: 验证修改**

检查 `src/lib/constants.ts` 中 QUERY 常量是否正确读取环境变量。

---

### Task 2.3: 移除未使用的 REQUEST_TIMEOUT_MS

**Files:**
- Modify: `src/lib/constants.ts:33-38`

- [ ] **Step 1: 修改 RETRY 常量，移除未使用的 REQUEST_TIMEOUT_MS**

```typescript
// Retry configuration
export const RETRY = {
  DEFAULT_RETRIES: 3,
  DEFAULT_DELAY_MS: 1000,
} as const;
```

- [ ] **Step 2: 验证修改**

检查 `REQUEST_TIMEOUT_MS` 是否已从 RETRY 常量中移除。

---

## Chunk 3: 图片处理配置

### Task 3.1: 更新 image-processing.ts

**Files:**
- Modify: `src/lib/storage/image-processing.ts:55-58`

- [ ] **Step 1: 修改 limitInputPixels 为读取环境变量**

```typescript
  try {
    let pipeline = sharp(buffer, {
      // Limit input dimensions to prevent memory issues
      limitInputPixels: parseInt(process.env.MAX_INPUT_PIXELS ?? "25000000", 10),
    });
```

- [ ] **Step 2: 修改图片质量默认值为读取环境变量**

在 DEFAULT_IMAGE_OPTIONS 前添加：

```typescript
/**
 * Get default image quality from environment or use fallback
 */
const getDefaultQuality = (): number => {
  const envQuality = process.env.MAX_IMAGE_QUALITY;
  if (envQuality != null) {
    const parsed = parseInt(envQuality, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      return parsed;
    }
  }
  return 85;
};
```

然后修改 DEFAULT_IMAGE_OPTIONS：

```typescript
export const DEFAULT_IMAGE_OPTIONS: Required<ImageProcessingOptions> = {
  maxDimension: 2048,
  quality: getDefaultQuality(),
  format: "auto",
  stripMetadata: true,
};
```

- [ ] **Step 3: 验证修改**

检查 `src/lib/storage/image-processing.ts` 是否正确读取环境变量。

---

## Chunk 4: API 限流配置

### Task 4.1: 更新 ratelimit.ts

**Files:**
- Modify: `src/lib/ratelimit.ts:86-92`

- [ ] **Step 1: 修改 RateLimitConfig 读取环境变量**

```typescript
/**
 * Rate limit configurations for different endpoints
 */
export const RateLimitConfig = {
  // API v1: configurable requests per minute per API key
  API_V1: {
    limit: parseInt(process.env.API_RATE_LIMIT_PER_MINUTE ?? "60", 10),
    windowMs: 60 * 1000,
  },
} as const;
```

- [ ] **Step 2: 验证修改**

检查 `src/lib/ratelimit.ts` 是否正确读取环境变量。

---

## Chunk 5: 会话安全配置

### Task 5.1: 更新 auth.ts

**Files:**
- Modify: `src/auth.ts:176-180`

- [ ] **Step 1: 修改 session 配置读取环境变量**

```typescript
  session: {
    strategy: "jwt",
    maxAge: parseInt(process.env.SESSION_MAX_AGE_DAYS ?? "14", 10) * TIME_SECONDS.DAY,
    updateAge: TIME_SECONDS.DAY, // Refresh daily
  },
```

- [ ] **Step 2: 验证修改**

检查 `src/auth.ts` 是否正确读取 SESSION_MAX_AGE_DAYS 环境变量。

---

## Chunk 6: OTP 限流配置

### Task 6.1: 更新 otp-rate-limit.ts

**Files:**
- Modify: `src/features/auth/server/services/otp-rate-limit.ts`

- [ ] **Step 1: 读取文件了解当前结构**

读取 `src/features/auth/server/services/otp-rate-limit.ts` 文件，了解当前硬编码值的位置。

- [ ] **Step 2: 修改 IP 和 Verify 限流为读取环境变量**

找到硬编码的常量：

```typescript
const IP_MAX_ATTEMPTS = 10; // 10 sends per IP
const IP_WINDOW_SECONDS = 60 * 60; // 1 hour
const VERIFY_MAX_ATTEMPTS = 10; // 10 verifies per IP per minute
const VERIFY_WINDOW_SECONDS = 60; // 1 minute
```

修改为：

```typescript
const IP_MAX_ATTEMPTS = parseInt(
  process.env.OTP_IP_MAX_ATTEMPTS_PER_HOUR ?? "10",
  10
); // sends per IP per hour
const IP_WINDOW_SECONDS = 60 * 60; // 1 hour (fixed)
const VERIFY_MAX_ATTEMPTS = parseInt(
  process.env.OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE ?? "5",
  10
); // verifies per IP per minute
const VERIFY_WINDOW_SECONDS = 60; // 1 minute (fixed)
```

- [ ] **Step 3: 验证修改**

检查 `otp-rate-limit.ts` 是否正确读取环境变量。

---

## Chunk 7: 导出限制配置

### Task 7.1: 更新 export.ts

**Files:**
- Modify: `src/features/ledger/server/actions/export.ts`

- [ ] **Step 1: 读取文件了解当前导出限制**

读取文件，找到默认 limit = 10000 的位置。

- [ ] **Step 2: 修改导出限制为读取环境变量**

将默认 limit 从 10000 改为读取环境变量：

```typescript
const DEFAULT_EXPORT_LIMIT = parseInt(
  process.env.EXPORT_MAX_ENTRIES ?? "2000",
  10
);
```

然后在函数参数中使用：

```typescript
options?.limit ?? DEFAULT_EXPORT_LIMIT
```

- [ ] **Step 3: 验证修改**

检查导出限制是否正确读取环境变量。

---

## Chunk 8: 验证与测试

### Task 8.1: 类型检查

**Files:**
- All modified files

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

---

### Task 8.2: 运行测试

**Files:**
- All modified files

- [ ] **Step 1: 运行单元测试**

```bash
npm run test:run
```

Expected: 所有测试通过。

---

### Task 8.3: 验证 .env.example 格式

**Files:**
- `.env.example`

- [ ] **Step 1: 检查 .env.example 格式一致性**

确保：
1. 所有新增配置都有注释说明
2. 配置分组清晰（使用 `# -----` 分隔）
3. 默认值与代码中的 fallback 值一致

---

## 总结

本次计划将以下默认值从硬编码迁移到 .env 配置：

| 配置项 | 原值 | 新默认值 | 环境变量 |
|--------|------|----------|----------|
| AI_TEMPERATURE | 1.0 | 0.3 | AI_TEMPERATURE |
| SOURCE_DOC_STALE_TIME_MS | 30秒 | 2分钟 | SOURCE_DOC_STALE_TIME_MS |
| CURRENCY_STALE_TIME_MS | 24小时 | 4小时 | CURRENCY_STALE_TIME_MS |
| API_RATE_LIMIT | 20/分钟 | 60/分钟 | API_RATE_LIMIT_PER_MINUTE |
| EXPORT_MAX_ENTRIES | 10000 | 2000 | EXPORT_MAX_ENTRIES |
| MAX_INPUT_PIXELS | 1亿 | 2500万 | MAX_INPUT_PIXELS |
| MAX_IMAGE_QUALITY | 85 | 85 | MAX_IMAGE_QUALITY |
| SESSION_MAX_AGE | 30天 | 14天 | SESSION_MAX_AGE_DAYS |
| OTP_VERIFY_MAX_ATTEMPTS | 10/分钟 | 5/分钟 | OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE |

---

## Appendix: 向后兼容性说明

所有修改都保持向后兼容：
- 代码中使用 `process.env.XXX ?? 原值` 模式
- 如果环境变量未设置，使用优化后的新默认值
- 用户可以通过 `.env` 文件覆盖任何默认值
