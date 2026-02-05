# TaskRunner 重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Flow Engine 重构为 TaskRunner，整合 AI 能力到 context，简化任务开发体验。

**Architecture:** 保持现有引擎结构，添加 `context.ai` 属性提供 AI 能力。自动化 token 统计（基于 AI 调用结果），隐藏 `signal` 和 `reportTokens`（内部使用）。保留 `updateProgress` 和四个生命周期钩子。

**Tech Stack:** TypeScript, OpenAI SDK, Vitest

---

## Task 1: 定义 AI 相关类型

**Files:**
- Modify: `src/lib/flow/types.ts`

**Step 1: 添加 AI 相关类型定义**

在 `types.ts` 末尾添加 AI 相关接口：

```typescript
// ===== AI Integration Types =====

/**
 * Response format for AI generation
 */
export type AIResponseFormat = 
    | 'text' 
    | 'json_object' 
    | { type: 'json_schema'; json_schema: object };

/**
 * Options for AI generation
 */
export interface AIGenerateOptions {
    prompt: string;                    // System prompt
    messages: AIMessage[];             // User messages (can include images)
    model?: string;                    // Model name, defaults to OPENAI_MODEL env
    maxTokens?: number;                // Max output tokens, defaults to 16384
    temperature?: number;              // Creativity (0-2), defaults to 1
    responseFormat?: AIResponseFormat; // Output format, defaults to 'text'
    autoReportTokens?: boolean;        // Auto-report tokens, defaults to true
}

/**
 * AI message content part
 */
export type AIMessageContentPart = 
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

/**
 * AI message
 */
export interface AIMessage {
    role: 'user' | 'assistant';
    content: string | AIMessageContentPart[];
}

/**
 * AI generation response
 */
export interface AIResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

/**
 * AI context interface
 */
export interface AIContext {
    generate(options: AIGenerateOptions): Promise<AIResponse>;
}
```

**Step 2: 更新 FlowContext 接口**

修改 `FlowContext` 接口，添加 `ai` 属性，将 `signal` 和 `reportTokens` 标记为内部使用：

```typescript
/**
 * Execution context passed to task handlers
 */
export interface FlowContext {
    taskId: string
    ledgerId: string | null
    // Note: signal and reportTokens are internal, use context.ai instead
    /** @internal */ signal: AbortSignal
    /** @internal */ reportTokens(usage: TokenUsage): void
    updateProgress(message: string): Promise<void>
    
    // AI capabilities
    ai: AIContext
}
```

**Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 类型错误（因为 engine.ts 还没更新）

**Step 4: Commit**

```bash
git add src/lib/flow/types.ts
git commit -m "feat(task-runner): add AI integration types"
```

---

## Task 2: 创建 AI Context 实现

**Files:**
- Create: `src/lib/flow/ai-context.ts`

**Step 1: 创建 AI Context 文件**

```typescript
import { getOpenAIClient } from '@/features/ai/server/services/openai';
import type { AIContext, AIGenerateOptions, AIResponse, TokenUsage } from './types';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Create AI context for task execution
 */
export function createAIContext(
    signal: AbortSignal,
    reportTokens: (usage: TokenUsage) => void
): AIContext {
    return {
        async generate(options: AIGenerateOptions): Promise<AIResponse> {
            const client = getOpenAIClient();
            
            // Convert messages to OpenAI format
            const messages: ChatCompletionMessageParam[] = options.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
            }));
            
            // Get model from options or environment
            const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
            const maxTokens = options.maxTokens ?? 16384;
            const temperature = options.temperature ?? 1;
            
            // Build response format
            let responseFormat: { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: object } | undefined;
            if (options.responseFormat) {
                if (options.responseFormat === 'text') {
                    responseFormat = { type: 'text' };
                } else if (options.responseFormat === 'json_object') {
                    responseFormat = { type: 'json_object' };
                } else {
                    responseFormat = options.responseFormat;
                }
            }
            
            // Call OpenAI (signal is passed internally for cancellation)
            const result = await client.generateContent(
                options.prompt,
                messages,
                model,
                maxTokens,
                temperature,
                responseFormat,
                signal
            );
            
            // Auto-report tokens unless disabled
            if (options.autoReportTokens !== false && result.usage) {
                reportTokens({
                    model,
                    input: result.usage.promptTokens,
                    output: result.usage.completionTokens,
                });
            }
            
            return {
                content: result.content,
                usage: result.usage,
            };
        },
    };
}
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 类型错误（OpenAI client 接口需要更新）

**Step 3: Commit**

```bash
git add src/lib/flow/ai-context.ts
git commit -m "feat(task-runner): create AI context implementation"
```

---

## Task 3: 更新 OpenAI Client 接口

**Files:**
- Modify: `src/features/ai/server/services/openai.ts`

**Step 1: 扩展 generateContent 方法签名**

更新 `generateContent` 方法，接受更多参数：

```typescript
async generateContent(
    systemPrompt: string,
    messages: ChatCompletionMessageParam[],
    model?: string,
    maxTokens?: number,
    temperature?: number,
    responseFormat?: { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: object },
    signal?: AbortSignal
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>
```

**Step 2: 实现扩展的参数支持**

在 `client.chat.completions.create` 调用中添加新参数：

```typescript
const response = await this.client.chat.completions.create({
    model: model ?? this.model,
    messages: [
        { role: "system", content: systemPrompt },
        ...messages,
    ],
    max_tokens: maxTokens ?? 16384,
    temperature: temperature ?? 1,
    ...(responseFormat && { response_format: responseFormat }),
}, {
    signal, // Pass abort signal
});
```

**Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/ai/server/services/openai.ts
git commit -m "feat(openai): extend generateContent with more options"
```

---

## Task 4: 更新 Flow Engine 集成 AI Context

**Files:**
- Modify: `src/lib/flow/engine.ts`

**Step 1: 导入 AI Context**

```typescript
import { createAIContext } from './ai-context';
```

**Step 2: 在 context 构建时添加 ai 属性**

在 `runTask` 函数中，更新 context 构建：

```typescript
// Build execution context
const context: FlowContext = {
    taskId,
    ledgerId,
    signal,
    reportTokens: (usage: TokenUsage) => {
        if (!tokenUsage[usage.model]) {
            tokenUsage[usage.model] = { input: 0, output: 0 }
        }
        tokenUsage[usage.model].input += usage.input
        tokenUsage[usage.model].output += usage.output
    },
    updateProgress: async (message: string) => {
        await config.storage.update(taskId, { progress: message })
    },
    // Add AI capabilities
    ai: createAIContext(signal, (usage: TokenUsage) => {
        if (!tokenUsage[usage.model]) {
            tokenUsage[usage.model] = { input: 0, output: 0 }
        }
        tokenUsage[usage.model].input += usage.input
        tokenUsage[usage.model].output += usage.output
    }),
}
```

**Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/flow/engine.ts
git commit -m "feat(task-runner): integrate AI context into engine"
```

---

## Task 5: 更新 index.ts 导出

**Files:**
- Modify: `src/lib/flow/index.ts`

**Step 1: 导出 AI Context**

```typescript
export { createAIContext } from './ai-context'
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/flow/index.ts
git commit -m "feat(task-runner): export AI context from flow module"
```

---

## Task 6: 添加 AI Context 单元测试

**Files:**
- Create: `tests/unit/lib/ai-context.test.ts`

**Step 1: 创建测试文件**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OpenAI client
vi.mock('@/features/ai/server/services/openai', () => ({
    getOpenAIClient: () => ({
        generateContent: vi.fn().mockResolvedValue({
            content: '{"result": "success"}',
            usage: { promptTokens: 100, completionTokens: 50 },
        }),
    }),
}));

import { createAIContext } from '@/lib/flow/ai-context';

describe('AI Context', () => {
    let reportTokensSpy: ReturnType<typeof vi.fn>;
    let abortController: AbortController;

    beforeEach(() => {
        reportTokensSpy = vi.fn();
        abortController = new AbortController();
    });

    it('generates content with default options', async () => {
        const aiContext = createAIContext(abortController.signal, reportTokensSpy);
        
        const result = await aiContext.generate({
            prompt: 'Test prompt',
            messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.content).toBe('{"result": "success"}');
        expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 });
    });

    it('auto-reports tokens by default', async () => {
        const aiContext = createAIContext(abortController.signal, reportTokensSpy);
        
        await aiContext.generate({
            prompt: 'Test prompt',
            messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(reportTokensSpy).toHaveBeenCalledWith({
            model: expect.any(String),
            input: 100,
            output: 50,
        });
    });

    it('does not report tokens when autoReportTokens is false', async () => {
        const aiContext = createAIContext(abortController.signal, reportTokensSpy);
        
        await aiContext.generate({
            prompt: 'Test prompt',
            messages: [{ role: 'user', content: 'Hello' }],
            autoReportTokens: false,
        });

        expect(reportTokensSpy).not.toHaveBeenCalled();
    });
});
```

**Step 2: 运行测试**

Run: `npm test -- tests/unit/lib/ai-context.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/lib/ai-context.test.ts
git commit -m "test(ai-context): add unit tests for AI context"
```

---

## Task 7: 更新 Flow Engine 集成测试

**Files:**
- Modify: `tests/integration/flow/flow-engine.test.ts`

**Step 1: 添加 AI Context 集成测试**

在文件末尾添加新的 describe 块：

```typescript
describe('AI context integration', () => {
    it('provides ai context with generate method', async () => {
        const engine = createFlowEngine({ storage });
        let hasAIContext = false;
        let hasGenerateMethod = false;

        engine.register('ai_context_task', {
            execute: async (_input: unknown, ctx: FlowContext) => {
                hasAIContext = ctx.ai !== undefined;
                hasGenerateMethod = typeof ctx.ai?.generate === 'function';
                return { hasAI: hasAIContext };
            },
        });

        const taskId = await engine.submit('ai_context_task', {});
        await waitForTaskCompletion(storage, taskId);

        expect(hasAIContext).toBe(true);
        expect(hasGenerateMethod).toBe(true);
    });
});
```

**Step 2: 运行测试**

Run: `npm test -- tests/integration/flow/flow-engine.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/flow/flow-engine.test.ts
git commit -m "test(flow-engine): add AI context integration test"
```

---

## Task 8: 更新 category-prompts.ts 移动位置

**Files:**
- Modify: `src/features/ai/server/services/category-prompts.ts` → 保留（属于 generate-category-metadata 任务）

**Step 1: 检查 category-prompts.ts 的引用**

此文件为 `generate-category-metadata` 任务服务，保留在原位置。

**Step 2: Commit (无变更)**

此任务无需代码变更，跳过。

---

## Task 9: 更新现有任务使用 context.ai

**Files:**
- Modify: `src/features/ledger/server/tasks/generate-category-metadata.ts`

**Step 1: 将 getOpenAIClient 调用改为 context.ai.generate**

```typescript
// 原来的代码
const client = getOpenAIClient();
const { content } = await client.generateContent(prompt, []);

// 改为
const { content } = await context.ai.generate({
    prompt,
    messages: [{ role: 'user', content: 'Generate category metadata based on the prompt.' }],
    model: 'gpt-4o-mini', // 可以用更便宜的模型
});
```

**Step 2: 移除 getOpenAIClient import**

**Step 3: 运行测试**

Run: `npm test -- tests/unit/features/tasks/generate-category-metadata.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/ledger/server/tasks/generate-category-metadata.ts
git commit -m "refactor(generate-category-metadata): use context.ai instead of direct OpenAI client"
```

---

## Task 10: 运行完整测试套件

**Step 1: 运行所有测试**

Run: `npm test`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: Commit & Tag**

```bash
git add -A
git commit -m "feat: complete TaskRunner AI integration"
```

---

## Verification Plan

### Automated Tests

1. **单元测试**
   - Run: `npm test -- tests/unit/lib/ai-context.test.ts`
   - Expected: All tests pass

2. **Flow Engine 集成测试**
   - Run: `npm test -- tests/integration/flow/flow-engine.test.ts`
   - Expected: All tests pass including new AI context test

3. **类型检查**
   - Run: `npx tsc --noEmit`
   - Expected: No type errors

4. **完整测试套件**
   - Run: `npm test`
   - Expected: All tests pass

### Manual Verification

由于这是基础设施重构，建议在线上环境部署后，测试以下功能：

1. **上传一张图片账单** - 验证 parse-source-document 任务正常工作
2. **创建新类别** - 验证 generate-category-metadata 任务正常工作
3. **检查任务中心** - 验证 token 统计正常显示
