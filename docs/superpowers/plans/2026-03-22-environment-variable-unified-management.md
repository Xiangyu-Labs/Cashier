# Environment Variable Unified Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Cashier 的环境变量声明、注释说明和启动期校验统一收敛到一个中心目录，确保缺失或非法配置在服务启动时就直接失败，而不是等到请求路径里才暴露。

**Architecture:** 新增 `src/lib/env/` 作为单一环境变量目录：`catalog.ts` 维护所有应用管理的 env key、所属层级、用途、是否必填与默认值；`startup.ts` 基于 catalog 和 `zod` 做启动期 presence/format 校验。选择把校验接在 `src/instrumentation.ts`，而不是 `next.config.ts`，这样 `next build`/Docker 构建不需要提前注入运行时 secret，但 `next start` 和正式服务启动仍然能 fail fast。这个改动不在本轮把所有 `process.env.*` 读取都改成 typed getter，只先统一“定义、文档、校验、回归测试”四个入口。

**Tech Stack:** TypeScript, Next.js 16 instrumentation hook, Zod, Vitest, Node `fs/path`

---

## Current Tree Reality

- `.env.example` 现在已经包含 `AUTH_EMAIL_FROM`，位于 `/home/dev/workspace/Cashier/.env.example` 第 131 行附近；真正的缺口是它没有按变量粒度统一写清楚“用途 / 是否必填 / 默认值”。
- 代码里还有一个额外漂移项：`/home/dev/workspace/Cashier/src/auth.ts` 第 45 行读取 `OIDC_BUTTON_NAME`，但前端已经使用 `NEXT_PUBLIC_OIDC_BUTTON_NAME`，示例文件和文档也只声明后者。这类重复命名会继续制造配置混乱。
- 当前启动期校验只覆盖了一小部分 AI 相关变量：`/home/dev/workspace/Cashier/src/lib/flow/config.ts` 和 `/home/dev/workspace/Cashier/src/lib/ai/openai-client.ts` 会在 flow runtime 初始化时抛错，但 `/home/dev/workspace/Cashier/src/instrumentation.ts` 自身还没有统一启动校验入口，所以 auth / URL / OIDC / optional numeric format 等问题仍然可能晚爆。

## Decision Notes

- `AUTH_EMAIL_FROM` 保持“可选 + 默认 `noreply@example.com`”语义，不把它升级为启动必填，因为 `/home/dev/workspace/Cashier/src/modules/auth/application/use-cases/send-otp.ts` 和 `/home/dev/workspace/Cashier/src/modules/auth/services/notifications.ts` 都已经提供了这个 fallback。
- `OIDC_BUTTON_NAME` 不新增到 `.env.example`，而是直接从代码里移除，统一改用已经存在的 `NEXT_PUBLIC_OIDC_BUTTON_NAME`。
- 启动校验不只检查“必填是否存在”，也要顺手验证“可选变量如果填写了，格式必须合法”，例如 URL、整数、布尔值和 OIDC all-or-none 组装规则。

## File Structure

### New Files

- `src/lib/env/catalog.ts`
  - 环境变量单一目录
  - 维护 key、tier、required、defaultValue、description、startupBehavior
  - 导出“应用管理 env”与“框架保留 env”列表，给测试和启动校验共用

- `src/lib/env/startup.ts`
  - 基于 `zod` 的启动期校验
  - 聚合缺失/非法项，统一抛出带细节的 `AppError`
  - 负责 OIDC all-or-none、URL、整数、布尔字符串等规则

- `tests/unit/lib/env/catalog.test.ts`
  - 扫描 `src/**/*.ts(x)` 里的 `process.env.*`
  - 断言所有应用管理 env 都在 catalog 中
  - 断言 `.env.example` 对 catalog 中的每个变量都存在标准注释块

- `tests/unit/lib/env/startup.test.ts`
  - 直接覆盖 startup validator 的缺失、默认值、非法格式和 OIDC 组合规则

### Modified Files

- `.env.example:11-174`
  - 按变量粒度统一补充用途 / Required / Default 注释
  - 保持现有 System / Runtime / Frontend 分层顺序
  - 把 AI 默认值注释写全，和 `CLAUDE.md` 对齐

- `src/auth.ts:28-46`
  - 把 `OIDC_BUTTON_NAME` 读取改为 `NEXT_PUBLIC_OIDC_BUTTON_NAME`

- `src/instrumentation.ts:1-29`
  - 在 flow runtime 初始化前调用 `validateStartupEnv`
  - 校验失败时直接记录启动错误并中止注册流程

- `tests/unit/auth/auth-config.test.ts:1-56`
  - 增加 OIDC provider label 的回归覆盖

- `tests/unit/instrumentation.test.ts:1-33`
  - 覆盖“先校验 env，再初始化 runtime”和“env 校验失败时不继续初始化”

- `CLAUDE.md:223-271`
  - 同步说明 AI 默认值与必填语义

- `docs/guides/ENV.md:21-259`
  - 同步变量 required/default 描述，避免和 `.env.example` 打架

- `docs/guides/RUNBOOK.md:35-74`
  - 同步运维速查表中的 required/default 结论

---

## Task 1: 建立环境变量目录并补齐 `.env.example`

**Files:**
- Create: `src/lib/env/catalog.ts`
- Create: `tests/unit/lib/env/catalog.test.ts`
- Modify: `.env.example:11-174`
- Modify: `src/auth.ts:28-46`
- Test: `tests/unit/auth/auth-config.test.ts:1-56`

- [ ] **Step 1: 先写 catalog 回归测试，扫描源码里的 `process.env.*` 并约束 `.env.example` 注释格式**

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ENV_CATALOG, FRAMEWORK_ENV_KEYS } from "@/lib/env/catalog";

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (entry === "node_modules" || entry === ".next") {
      return [];
    }
    if (statSync(fullPath).isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("env catalog coverage", () => {
  it("documents every application-managed env key used by source files", () => {
    const example = readFileSync(path.resolve(".env.example"), "utf8");
    const usedKeys = new Set<string>();

    for (const file of collectSourceFiles(path.resolve("src"))) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        usedKeys.add(match[1]);
      }
    }

    for (const key of usedKeys) {
      if (FRAMEWORK_ENV_KEYS.has(key)) continue;
      expect(APP_ENV_CATALOG.map((entry) => entry.name)).toContain(key);
      expect(example).toMatch(
        new RegExp(`# Required:\\s+.+\\n# Default:\\s+.+\\n${key}=`, "m")
      );
    }
  });
});
```

- [ ] **Step 2: 运行测试，确认它先红灯**

Run: `npx vitest run tests/unit/lib/env/catalog.test.ts`

Expected: `FAIL`，因为 `@/lib/env/catalog` 还不存在，而且当前 `.env.example` 还没有统一的 `Required / Default` 注释块

- [ ] **Step 3: 在 auth 配置测试里补一个失败用例，明确 OIDC provider label 只能来自 `NEXT_PUBLIC_OIDC_BUTTON_NAME`**

```typescript
it("uses NEXT_PUBLIC_OIDC_BUTTON_NAME for the OIDC provider label", async () => {
  process.env.OIDC_ISSUER = "https://sso.cashier.test";
  process.env.OIDC_CLIENT_ID = "cashier-web";
  process.env.OIDC_CLIENT_SECRET = "top-secret";
  process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME = "Cashier SSO";

  await import("@/auth");

  const config = nextAuthMock.mock.calls[0]?.[0] as { providers?: Array<{ name?: string }> };
  expect(config.providers?.[0]?.name).toBe("Cashier SSO");
});
```

- [ ] **Step 4: 再跑一遍聚焦测试，确认 `src/auth.ts` 的现状也被测红**

Run: `npx vitest run tests/unit/lib/env/catalog.test.ts tests/unit/auth/auth-config.test.ts`

Expected: `FAIL`，其中 auth 测试会因为当前代码仍在读取 `OIDC_BUTTON_NAME`

- [ ] **Step 5: 用最小实现建好 env catalog、统一 OIDC button name，并把 `.env.example` 改成标准注释块**

```typescript
export interface EnvCatalogEntry {
  name: string;
  tier: "system" | "runtime" | "frontend";
  required: boolean;
  defaultValue: string | null;
  description: string;
  validateOnStartup: boolean;
}

export const APP_ENV_CATALOG: EnvCatalogEntry[] = [
  {
    name: "OPENAI_API_KEY",
    tier: "system",
    required: true,
    defaultValue: null,
    description: "API key for receipt parsing and categorization",
    validateOnStartup: true,
  },
  {
    name: "AUTH_EMAIL_FROM",
    tier: "runtime",
    required: false,
    defaultValue: "noreply@example.com",
    description: "Sender address for OTP and login notification emails",
    validateOnStartup: false,
  },
];

export const FRAMEWORK_ENV_KEYS = new Set(["NODE_ENV", "NEXT_RUNTIME", "NO_DB"]);
```

`.env.example` 的每个变量块统一成下面这种格式，不再混用“有的变量有注释，有的变量没有”的写法：

```dotenv
# Text model used by server-side AI workflows.
# Required: Yes
# Default: gpt-4o-mini
AI_MODEL_TEXT=gpt-4o-mini
```

`src/auth.ts` 里的 provider label 改成：

```typescript
name: process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME ?? "SSO",
```

- [ ] **Step 6: 重新运行聚焦测试，确认 catalog、示例文件和 auth 读取逻辑全部转绿**

Run: `npx vitest run tests/unit/lib/env/catalog.test.ts tests/unit/auth/auth-config.test.ts`

Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add src/lib/env/catalog.ts tests/unit/lib/env/catalog.test.ts src/auth.ts tests/unit/auth/auth-config.test.ts .env.example
git commit -m "chore: centralize env inventory and example documentation"
```

---

## Task 2: 实现启动期环境变量校验器

**Files:**
- Create: `src/lib/env/startup.ts`
- Create: `tests/unit/lib/env/startup.test.ts`
- Modify: `src/lib/env/catalog.ts`

- [ ] **Step 1: 先写失败测试，覆盖“缺失必填项”和“可选项填写非法值”两类问题**

```typescript
import { describe, expect, it } from "vitest";
import { validateStartupEnv } from "@/lib/env/startup";

const baseEnv = {
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_API_KEY: "sk-test",
  AUTH_SECRET: "auth-secret",
  AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  AI_MODEL_TEXT: "gpt-4o-mini",
  AI_MODEL_VISION: "gpt-4o",
} as NodeJS.ProcessEnv;

describe("validateStartupEnv", () => {
  it("reports missing required startup env vars together", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        OPENAI_API_KEY: "",
        AUTH_SECRET: "",
      })
    ).toThrow(/OPENAI_API_KEY|AUTH_SECRET/);
  });

  it("rejects invalid numeric values and partial OIDC config", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        AI_MAX_RETRIES: "-1",
        OIDC_ISSUER: "https://sso.cashier.test",
      })
    ).toThrow(/AI_MAX_RETRIES|OIDC_CLIENT_ID|OIDC_CLIENT_SECRET/);
  });
});
```

- [ ] **Step 2: 运行测试，确认红灯**

Run: `npx vitest run tests/unit/lib/env/startup.test.ts`

Expected: `FAIL`，因为 `@/lib/env/startup` 还不存在

- [ ] **Step 3: 用 `zod` 实现 startup validator，并把高价值默认值直接标准化返回**

```typescript
import { z } from "zod";
import { AppError } from "@/lib/errors";

const startupEnvSchema = z
  .object({
    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
    OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
    AUTH_SECRET: z.string().trim().min(1, "AUTH_SECRET is required"),
    AUTH_URL: z.string().url().optional().or(z.literal("")),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    AI_MODEL_TEXT: z.string().trim().min(1, "AI_MODEL_TEXT is required"),
    AI_MODEL_VISION: z.string().trim().min(1, "AI_MODEL_VISION is required"),
    AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
    AI_RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(1000),
    NEXT_PUBLIC_OIDC_ENABLED: z.enum(["true", "false"]).default("false"),
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const oidcValues = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET];
    const hasAnyOidc = oidcValues.some((value) => value != null && value !== "");
    const hasAllOidc = oidcValues.every((value) => value != null && value !== "");

    if (hasAnyOidc && !hasAllOidc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be set together",
      });
    }
  });

export function validateStartupEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = startupEnvSchema.safeParse(env);
  if (!result.success) {
    throw new AppError("Startup environment validation failed", "STARTUP_ENV_INVALID", {
      issues: result.error.issues,
    });
  }
  return result.data;
}
```

- [ ] **Step 4: 补一个成功路径测试，确认默认值会被标准化，而不是只做存在性检查**

```typescript
it("applies defaults for optional startup-validated env vars", () => {
  const result = validateStartupEnv(baseEnv);

  expect(result.AI_MAX_RETRIES).toBe(3);
  expect(result.AI_RETRY_DELAY_MS).toBe(1000);
  expect(result.NEXT_PUBLIC_OIDC_ENABLED).toBe("false");
});
```

- [ ] **Step 5: 运行启动校验测试，确认转绿**

Run: `npx vitest run tests/unit/lib/env/startup.test.ts`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/lib/env/catalog.ts src/lib/env/startup.ts tests/unit/lib/env/startup.test.ts
git commit -m "feat: add startup env validation"
```

---

## Task 3: 在 instrumentation 启动入口接入校验

**Files:**
- Modify: `src/instrumentation.ts:1-29`
- Modify: `tests/unit/instrumentation.test.ts:1-33`
- Reference: `src/lib/flow/runtime.ts:65-78`

- [ ] **Step 1: 先把 instrumentation 测试写红，明确校验顺序和失败行为**

```typescript
const validateStartupEnv = vi.fn();

vi.mock("@/lib/env/startup", () => ({
  validateStartupEnv,
}));

it("validates startup env before initializing the flow runtime", async () => {
  const { register } = await import("@/instrumentation");

  await register();

  expect(validateStartupEnv).toHaveBeenCalledTimes(1);
  expect(validateStartupEnv.mock.invocationCallOrder[0]).toBeLessThan(
    initializeDefaultFlowRuntime.mock.invocationCallOrder[0]
  );
});

it("rethrows startup env validation failures without initializing the runtime", async () => {
  validateStartupEnv.mockImplementationOnce(() => {
    throw new Error("invalid env");
  });

  const { register } = await import("@/instrumentation");

  await expect(register()).rejects.toThrow("invalid env");
  expect(initializeDefaultFlowRuntime).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行 instrumentation 测试，确认当前实现是红灯**

Run: `npx vitest run tests/unit/instrumentation.test.ts`

Expected: `FAIL`，因为 `register()` 还没有在 runtime 初始化前调用 `validateStartupEnv`

- [ ] **Step 3: 在 `src/instrumentation.ts` 最前面接入 startup validator，并保留现有 flow runtime 初始化逻辑**

```typescript
import { validateStartupEnv } from "@/lib/env/startup";
import { logger } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  logger.info("Starting Cashier service...");

  try {
    const startupEnv = validateStartupEnv();

    logger.info(
      {
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: startupEnv.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
      },
      "Service configuration status"
    );

    const { initializeDefaultFlowRuntime } = await import("@/lib/flow/runtime");
    await initializeDefaultFlowRuntime();
    logger.info("Flow runtime initialized successfully");
  } catch (error) {
    logger.error({ error }, "Failed during startup initialization");
    throw error;
  }
}
```

- [ ] **Step 4: 重跑 instrumentation 聚焦测试**

Run: `npx vitest run tests/unit/instrumentation.test.ts tests/unit/lib/env/startup.test.ts`

Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/instrumentation.ts tests/unit/instrumentation.test.ts
git commit -m "feat: fail fast on invalid startup env"
```

---

## Task 4: 同步协作文档并做最终回归

**Files:**
- Modify: `CLAUDE.md:223-271`
- Modify: `docs/guides/ENV.md:21-259`
- Modify: `docs/guides/RUNBOOK.md:35-74`
- Reference: `.env.example`

- [ ] **Step 1: 更新文档，确保 `.env.example`、`CLAUDE.md`、`ENV.md`、`RUNBOOK.md` 对关键变量的 required/default 结论一致**

至少把下面几组信息同步成同一口径：

```md
- `AI_MODEL_TEXT` - Text model for business logic (required at startup, default: `gpt-4o-mini`)
- `AI_MODEL_VISION` - Vision model for image description (required at startup, default: `gpt-4o`)
- `AI_MAX_RETRIES` - Max retry attempts (default: 3)
- `AI_RETRY_DELAY_MS` - Retry delay in ms (default: 1000)
- `AUTH_EMAIL_FROM` - Email address for OTP/login emails (optional, default: `noreply@example.com`)
```

- [ ] **Step 2: 用 `rg` 快速比对关键变量在文档和示例文件中的描述**

Run: `rg -n "AUTH_EMAIL_FROM|AI_MODEL_TEXT|AI_MODEL_VISION|AI_MAX_RETRIES|AI_RETRY_DELAY_MS|NEXT_PUBLIC_OIDC_BUTTON_NAME" .env.example CLAUDE.md docs/guides/ENV.md docs/guides/RUNBOOK.md`

Expected: 四个文件都能搜到对应变量，并且 required/default 描述不互相冲突

- [ ] **Step 3: 跑完整的聚焦回归和 lint**

Run: `npx vitest run tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/startup.test.ts tests/unit/instrumentation.test.ts tests/unit/auth/auth-config.test.ts tests/unit/lib/flow/config.test.ts`

Expected: `PASS`

Run: `npx eslint src/auth.ts src/instrumentation.ts src/lib/env tests/unit/lib/env tests/unit/auth/auth-config.test.ts tests/unit/instrumentation.test.ts`

Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/guides/ENV.md docs/guides/RUNBOOK.md
git commit -m "docs: sync environment variable guidance"
```

---

## Final Verification Checklist

- `.env.example` 中每个应用管理的变量都带有统一格式的用途 / Required / Default 注释
- `src/auth.ts` 不再出现 `OIDC_BUTTON_NAME`
- `src/instrumentation.ts` 在 flow runtime 初始化前先做 startup env 校验
- 缺失 `OPENAI_API_KEY`、`AUTH_SECRET`、`AI_MODEL_TEXT`、`AI_MODEL_VISION` 等关键变量时，服务启动直接失败
- OIDC 只要配置了一部分变量就会启动失败，不再等登录流程里才暴露
- `AUTH_EMAIL_FROM` 仍然保持可选，并继续和现有 fallback 行为一致

## Self-Review

**Status:** Approved

**Checks passed:**
- 计划覆盖了用户要求的两个目标：补齐/规范 `.env.example`，以及启动期 fail-fast 校验
- 计划解释了当前仓库里和用户描述不同的地方：`AUTH_EMAIL_FROM` 已存在，但仍需标准化；新增发现的 `OIDC_BUTTON_NAME` 漂移也被纳入修复
- 每个任务都给了明确文件、测试命令、预期失败/成功结果和提交点，执行时不需要再自己猜路径
