# TaskRunner 重构设计

## 概述

将 Flow Engine 重构为 TaskRunner，整合 AI 能力，简化任务开发体验。

## 设计决策

### 1. 命名变更

| 原名 | 新名 |
|------|------|
| `lib/flow/` | `lib/task-runner/` |
| `FlowEngine` | `TaskRunner` |
| `FlowContext` | `TaskContext` |
| `FlowTaskHandler` | `TaskHandler` |

---

### 2. Context API（对外暴露）

```typescript
interface TaskContext {
    ledgerId?: string;
    
    // AI 能力
    ai: {
        generate(options: AIGenerateOptions): Promise<AIResponse>;
    };
    
    // 进度上报（可选使用）
    updateProgress(message: string): Promise<void>;
}
```

#### AIGenerateOptions

```typescript
interface AIGenerateOptions {
    prompt: string;                    // 必填：系统提示词
    messages: Message[];               // 必填：用户消息（含图片）
    model?: string;                    // 可选：默认用 OPENAI_MODEL 环境变量
    maxTokens?: number;                // 可选：默认 16384
    temperature?: number;              // 可选：默认 1
    responseFormat?: ResponseFormat;   // 可选：默认 'text'
    autoReportTokens?: boolean;        // 可选：默认 true
}

type ResponseFormat = 
    | 'text' 
    | 'json_object' 
    | { type: 'json_schema'; json_schema: object };
```

---

### 3. 内部自动化（业务不可见）

| 功能 | 处理方式 |
|------|---------|
| Token 统计 | `ai.generate()` 后自动上报 |
| 取消任务 | 内部透传 AbortSignal |
| 错误处理 | AI 调用失败自动 throw |
| 重试 | OpenAI 客户端内部处理 |

---

### 4. 任务 Handler 结构

```typescript
interface TaskHandler<TInput, TOutput> {
    execute(input: TInput, context: TaskContext): Promise<TOutput>;
    onComplete?(output: TOutput, input: TInput, context: TaskContext): Promise<void>;
    onError?(error: Error, input: TInput, context: TaskContext): Promise<void>;
    onCancel?(input: TInput, context: TaskContext): Promise<void>;
}
```

---

### 5. 环境变量

保留：
- `OPENAI_MODEL` - 默认模型
- `AI_MAX_RETRIES` - 重试次数
- `AI_RETRY_DELAY_MS` - 重试延迟

---

## 使用示例

```typescript
const parseDocumentHandler: TaskHandler<ParseInput, ParseOutput> = {
    async execute(input, context) {
        // 第一次 AI 调用
        const result1 = await context.ai.generate({
            prompt: buildPrompt(input),
            messages: buildMessages(input),
            model: "gpt-4o",  // 显式指定
        });
        
        // 第二次 AI 调用（不同模型）
        const result2 = await context.ai.generate({
            prompt: arbitrationPrompt,
            messages: [...],
            model: "gpt-4o-mini",  // 省钱
            temperature: 0,
        });
        
        // 进度更新（可选）
        await context.updateProgress("正在验证结果...");
        
        return mergeResults(result1, result2);
    },
    
    async onComplete(output, input, context) {
        // 保存到数据库
    },
    
    async onError(error, input, context) {
        // 标记异常
    },
    
    async onCancel(input, context) {
        // 清理资源
    }
};

taskRunner.register("parse_document", parseDocumentHandler);
```

---

## 不做的事情（YAGNI）

- ❌ 多 AI 提供商支持（以后再说）
- ❌ Streaming 支持（以后再说）
- ❌ 并发限制（以后在 OpenAI 客户端层加）
- ❌ 模型预设分类（业务自己指定模型）

---

## 文件变更

### 重命名/移动

```
lib/flow/           → lib/task-runner/
├── engine.ts       → runner.ts
├── types.ts        → types.ts (更新)
└── index.ts        → index.ts (更新)
```

### 删除

```
features/ai/server/services/processor.ts  # 合并到任务文件
features/ai/server/services/prompts.ts    # 移到任务目录
```

### 保留

```
features/ai/server/services/openai.ts     # 通用 OpenAI 客户端
```

### 任务文件调整

将 `prompts.ts` 和 `arbitration.ts` 移到各自任务目录：

```
features/source-document/server/tasks/
├── parse-source-document.ts
├── parse-prompts.ts          # 从 ai/services/ 移来
└── parse-arbitration.ts      # 从 ai/services/ 移来
```
