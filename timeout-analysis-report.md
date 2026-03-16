# Cashier 项目外部 HTTP 调用超时配置分析报告

## 执行摘要

**分析日期**: 2026-03-16
**项目路径**: /root/workspace/Cashier
**分析范围**: 所有外部 HTTP 调用（OpenAI API、汇率 API、邮件服务、OIDC/SSO）

### 总体风险评估: **高**

在高延迟网络（200ms+ 延迟、10%+ 丢包）环境下，项目存在多处**缺少超时保护**的关键调用，可能导致请求无限挂起和连锁故障。

---

## 1. 外部 HTTP 调用详细分析

### 1.1 OpenAI API 调用

**文件位置**: `src/lib/ai/openai-client.ts`

| 配置项 | 当前值 | 评估 |
|--------|--------|------|
| SDK 默认超时 | **10 分钟** | 过长，高延迟下会长时间挂起 |
| 应用级超时 | **未设置** | 风险高 |
| 重试次数 | `AI_MAX_RETRIES` (默认 3) | 可配置 |
| 重试延迟 | `AI_RETRY_DELAY_MS` (默认 1000ms) | 可配置 |
| AbortSignal 支持 | 已支持 | 良好 |

**代码分析**:
```typescript
// 第 16-20 行: OpenAI 客户端初始化
this.client = new OpenAI({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: process.env.NODE_ENV === "test",
    // 注意: 没有设置 timeout 参数，使用 SDK 默认 10 分钟
});

// 第 56 行: 调用时传递 AbortSignal
const response = await this.client.chat.completions.create({...}, {
    signal, // 支持取消信号
});
```

**高延迟风险评估**: **高**
- 10 分钟默认超时在网络分区或高延迟下会导致请求长时间挂起
- 每次重试都会重新经历完整超时周期
- 最坏情况下：3 次重试 × 10 分钟 = 30 分钟挂起

**连锁反应**:
- Flow Engine 并发槽位被长期占用（默认 10 个并发）
- 新任务无法执行，队列堆积
- 用户无法取消已超时的任务（AbortController 只能在运行中取消）

---

### 1.2 汇率 API (Frankfurter)

**文件位置**: `src/features/currency/server/exchange-rate-service.ts`

| 配置项 | 当前值 | 评估 |
|--------|--------|------|
| 超时设置 | **5 秒** | 合理 |
| 重试次数 | 3 次 | 合理 |
| 重试延迟 | 指数退避 (1s, 2s, 4s) | 合理 |
| 请求折叠 | 已实现 | 良好（防止重复请求）|

**代码分析**:
```typescript
// 第 91 行: 5 秒超时配置
return await fetch(url, { signal: AbortSignal.timeout(5000) });

// 第 88-94 行: 带重试的获取
private static async fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetch(url, { signal: AbortSignal.timeout(5000) });
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
    }
}
```

**高延迟风险评估**: **低**
- 5 秒超时配置合理
- 指数退避重试策略适当
- 最坏情况下总等待时间：5s + 1s + 5s + 2s + 5s + 4s + 5s = 27 秒

---

### 1.3 邮件服务 (Resend)

**文件位置**:
- `src/features/auth/server/actions/auth.ts` (第 88 行)
- `src/features/auth/server/services/notifications.ts` (第 21 行)

| 配置项 | 当前值 | 评估 |
|--------|--------|------|
| SDK 版本 | 6.9.3 | - |
| 超时设置 | **未设置** | **高风险** |
| 重试策略 | **无** | **高风险** |
| AbortSignal | **不支持** | **高风险** |

**代码分析**:
```typescript
// src/features/auth/server/actions/auth.ts 第 22 行
const resend = new Resend(process.env.AUTH_RESEND_KEY);

// 第 88 行: 发送邮件（无任何超时配置）
await resend.emails.send({
    from: process.env.AUTH_EMAIL_FROM || "noreply@example.com",
    to: normalizedEmail,
    subject: `Your verification code is ${otp}`,
    react: OTPEmail({...}),
});
```

**Resend SDK 分析**:
- Resend SDK 底层使用 `fetch()` 但没有暴露超时配置选项
- 没有内置重试机制
- 不支持 AbortSignal/取消操作
- 依赖 Node.js 默认的 HTTP 超时（可能无限挂起）

**高延迟风险评估**: **高**
- 无超时保护，网络故障时可能无限挂起
- 发生在用户登录关键路径上，直接影响用户体验
- OTP 发送失败无优雅降级（仅记录日志）

---

### 1.4 OIDC/SSO 认证

**文件位置**: `src/auth.ts`

| 配置项 | 当前值 | 评估 |
|--------|--------|------|
| 发现端点 | `.well-known/openid-configuration` | 动态获取 |
| 超时设置 | **未配置** | **中风险** |
| 依赖库 | NextAuth.js 5.0.0-beta.30 | - |

**代码分析**:
```typescript
// 第 30-48 行: OIDC Provider 配置
const OIDCProvider = ((): OAuthConfig<OIDCProfile> | null => {
    // ...
    return {
        id: "oidc",
        name: process.env.OIDC_BUTTON_NAME || "SSO",
        type: "oidc",
        issuer,
        wellKnown: `${issuer}/.well-known/openid-configuration`, // 发现端点
        // 无超时配置
    };
})();
```

**高延迟风险评估**: **中**
- NextAuth.js 内部处理 OIDC 流程，超时行为由库控制
- 发现端点获取、token 交换、用户信息获取都可能受延迟影响
- 用户可刷新页面重试，非关键后台任务

---

## 2. AI 任务流水线超时分析

### 2.1 任务执行流程

```
Parse Source Document Task
├── Stage 0: Vision Description (可选)
│   └── 1x OpenAI vision call
├── Stage 1: Pre-Analysis
│   ├── Validity Check: 2x GPT + 可能的 1x Arbitration
│   ├── Completeness Check: 1x GPT
│   ├── Currency Recognition: 2x GPT + 可能的 1x Arbitration
│   ├── Category Recognition: 2x GPT + 可能的 1x Arbitration
│   └── Title Extraction: 1x GPT
├── Stage 1.5: Validation: 1x GPT
└── Stage 2: Detailed Parsing
    └── 2x GPT + 可能的 1x Arbitration
```

### 2.2 最坏情况下的 OpenAI 调用次数

| 阶段 | 正常情况 | 需要仲裁 | 总计 (最坏) |
|------|----------|----------|-------------|
| Stage 0 | 1 | 0 | 1 |
| Stage 1 Validity | 2 | 1 | 3 |
| Stage 1 Completeness | 1 | 0 | 1 |
| Stage 1 Currency | 2 | 1 | 3 |
| Stage 1 Category | 2 | 1 | 3 |
| Stage 1 Title | 1 | 0 | 1 |
| Stage 1.5 | 1 | 0 | 1 |
| Stage 2 | 2 | 1 | 3 |
| **总计** | **12** | **4** | **16** |

### 2.3 高延迟下的时间估算

假设网络延迟 200ms，丢包率 10%：

| 场景 | 计算 | 预估时间 |
|------|------|----------|
| 单次调用 (正常) | 200ms RTT + 处理 | ~500ms |
| 单次调用 (重试) | 3 次尝试 × 500ms | ~1.5s |
| 完整文档解析 (正常) | 12 × 500ms | ~6 秒 |
| 完整文档解析 (高延迟+仲裁) | 16 × 1.5s | ~24 秒 |
| 最坏情况 (每次调用都超时重试) | 16 × 30 分钟 | **8 小时** |

**风险**: 在高延迟环境下，单个文档解析任务可能占用 Flow Engine 并发槽位数小时，导致其他任务完全无法执行。

---

## 3. 缺少超时保护的关键调用

### 3.1 高风险问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | OpenAI 默认 10 分钟超时 | `openai-client.ts:16` | 任务挂起 30 分钟+ |
| 2 | Resend 无超时配置 | `auth.ts:88`, `notifications.ts:21` | 登录流程无限挂起 |
| 3 | 无整体任务超时 | `flow/engine.ts` | 任务可能永远运行 |

### 3.2 中风险问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 4 | OIDC 无超时配置 | `auth.ts:45` | SSO 登录缓慢/失败 |
| 5 | JSON 修复无单独超时 | `ai-context.ts:76-105` | 可能额外增加 10 分钟+ |

---

## 4. 改进建议

### 4.1 立即修复（高优先级）

#### 建议 1: 为 OpenAI 客户端配置合理超时

**文件**: `src/lib/ai/openai-client.ts`

```typescript
constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }

    // 配置 60 秒超时（足够处理大多数请求，包括图像）
    const timeout = parseInt(process.env.AI_TIMEOUT_MS || "60000", 10);

    this.client = new OpenAI({
        apiKey,
        baseURL,
        timeout, // 添加超时配置
        dangerouslyAllowBrowser: process.env.NODE_ENV === "test",
    });
}
```

**环境变量**: 添加 `AI_TIMEOUT_MS`（默认 60000ms = 60 秒）

#### 建议 2: 为 Resend 添加超时包装

**文件**: `src/features/auth/server/actions/auth.ts`

```typescript
// 添加带超时的邮件发送包装函数
async function sendEmailWithTimeout(
    resend: Resend,
    options: Parameters<Resend['emails']['send']>[0],
    timeoutMs = 10000
): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // 注意: Resend SDK 可能不直接支持 AbortSignal
        // 需要检查 SDK 版本或使用底层 fetch 实现
        await Promise.race([
            resend.emails.send(options),
            new Promise((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new Error('Email send timeout'));
                });
            }),
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}
```

**替代方案**: 由于 Resend SDK 可能不支持 AbortSignal，考虑使用底层 HTTP 客户端或设置 `setTimeout` 包装。

#### 建议 3: 为 Flow Engine 添加任务级超时

**文件**: `src/lib/flow/engine.ts`

```typescript
export interface FlowEngineConfig {
  storage: StorageAdapter
  maxConcurrentTasks?: number
  taskTimeoutMs?: number // 添加任务超时配置
}

// 在 runTask 中实现
async function runTask<TInput>(...) {
    const taskTimeout = config.taskTimeoutMs || 300000; // 默认 5 分钟
    const timeoutHandle = setTimeout(() => {
        controller.abort();
        logger.warn({ taskId }, 'Task timed out, aborting');
    }, taskTimeout);

    try {
        // ... 任务执行
    } finally {
        clearTimeout(timeoutHandle);
    }
}
```

### 4.2 中期改进（中优先级）

#### 建议 4: 为 OIDC 配置超时

**文件**: `src/auth.ts`

```typescript
return {
    id: "oidc",
    name: process.env.OIDC_BUTTON_NAME || "SSO",
    type: "oidc",
    issuer,
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    httpOptions: {
        timeout: 10000, // 10 秒超时
    },
    // ...
};
```

#### 建议 5: 添加环境变量文档

**文件**: `.env.example`

```bash
# AI 超时配置（毫秒）
AI_TIMEOUT_MS=60000

# 任务执行超时（毫秒）
TASK_TIMEOUT_MS=300000

# 邮件发送超时（毫秒）
EMAIL_TIMEOUT_MS=10000
```

### 4.3 长期优化（低优先级）

#### 建议 6: 实现自适应超时

根据网络状况动态调整超时时间：

```typescript
class AdaptiveTimeout {
    private history: number[] = [];

    recordLatency(ms: number) {
        this.history.push(ms);
        if (this.history.length > 10) this.history.shift();
    }

    getRecommendedTimeout(): number {
        const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
        return Math.max(30000, avg * 3); // 3x 平均延迟，最小 30 秒
    }
}
```

#### 建议 7: 实现断路器模式

对于持续失败的 API 调用，实现断路器防止级联故障：

```typescript
class CircuitBreaker {
    private failures = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            throw new Error('Circuit breaker is open');
        }
        // ... 实现逻辑
    }
}
```

---

## 5. 配置建议汇总

### 5.1 推荐的环境变量配置

```bash
# ==============================================================================
# AI 配置
# ==============================================================================
AI_MODEL_TEXT=gpt-4o-mini
AI_MODEL_VISION=gpt-4o
AI_MAX_RETRIES=3
AI_RETRY_DELAY_MS=1000
AI_TIMEOUT_MS=60000          # 新增: OpenAI API 超时（60秒）

# ==============================================================================
# 任务队列配置
# ==============================================================================
MAX_TASK_WORKER=10
TASK_TIMEOUT_MS=300000       # 新增: 单个任务最大执行时间（5分钟）

# ==============================================================================
# 邮件配置
# ==============================================================================
EMAIL_TIMEOUT_MS=10000       # 新增: 邮件发送超时（10秒）
AUTH_EMAIL_FROM=noreply@example.com
```

### 5.2 各场景推荐超时值

| 场景 | 推荐超时 | 理由 |
|------|----------|------|
| OpenAI API 调用 | 60 秒 | 足够处理复杂图像解析 |
| 汇率 API 调用 | 5 秒 | 轻量级 REST API，已配置 |
| 邮件发送 | 10 秒 | 邮件服务通常快速响应 |
| OIDC 发现/Token | 10 秒 | OAuth 标准流程 |
| 整体任务执行 | 5 分钟 | 防止无限挂起，允许复杂文档 |

---

## 6. 测试建议

### 6.1 高延迟模拟测试

使用 `toxiproxy` 或类似工具模拟高延迟环境：

```bash
# 模拟 200ms 延迟 + 10% 丢包
toxiproxy-cli toxic add -t latency -a latency=200 -a jitter=50 openai
toxiproxy-cli toxic add -t timeout -a timeout=10000 openai
```

### 6.2 单元测试场景

```typescript
// tests/unit/lib/ai/openai-client.test.ts
describe('OpenAI Client Timeout', () => {
    it('should timeout after AI_TIMEOUT_MS', async () => {
        // 模拟延迟响应
        // 验证超时行为
    });

    it('should retry on timeout with exponential backoff', async () => {
        // 验证重试逻辑
    });
});
```

---

## 7. 总结

### 7.1 关键发现

1. **OpenAI 调用**: 默认 10 分钟超时过长，建议缩短至 60 秒
2. **Resend 邮件**: 完全无超时保护，需要立即添加
3. **任务引擎**: 缺少整体任务超时，可能导致无限挂起
4. **汇率 API**: 配置良好（5 秒超时 + 重试）

### 7.2 风险等级分布

| 等级 | 数量 | 问题 |
|------|------|------|
| 高 | 3 | OpenAI 超时、Resend 无超时、任务无整体超时 |
| 中 | 2 | OIDC 无超时、JSON 修复无超时 |
| 低 | 1 | 汇率 API 配置良好 |

### 7.3 修复优先级

1. **P0 (立即)**: 为 Resend 邮件发送添加超时保护
2. **P1 (本周)**: 为 OpenAI 客户端配置 60 秒超时
3. **P2 (本月)**: 为 Flow Engine 添加任务级超时
4. **P3 (未来)**: OIDC 超时配置、自适应超时、断路器

---

## 附录: 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/lib/ai/openai-client.ts` | OpenAI 客户端实现 |
| `src/lib/flow/ai-context.ts` | AI 上下文（含 JSON 修复）|
| `src/lib/flow/engine.ts` | 任务引擎实现 |
| `src/features/currency/server/exchange-rate-service.ts` | 汇率服务（配置良好）|
| `src/features/auth/server/actions/auth.ts` | OTP 发送（Resend）|
| `src/features/auth/server/services/notifications.ts` | 登录通知邮件 |
| `src/auth.ts` | NextAuth + OIDC 配置 |
| `src/features/source-document/server/tasks/parse-source-document.ts` | 文档解析任务 |
| `src/features/source-document/server/tasks/stage1-executor.ts` | Stage 1 执行器 |
| `src/lib/ai/dual-gpt-runner.ts` | 双 GPT + 仲裁模式 |
