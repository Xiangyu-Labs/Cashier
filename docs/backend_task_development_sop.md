# 后台任务开发 SOP (Standard Operating Procedure)

## 📋 目的

本文档定义了**In-Process Asynchronous Tasks**（进程内异步任务）的标准开发流程。
我们已移除 BullMQ 和 Worker 容器，转而使用轻量级的进程内 Promise 执行。

**特点**：
- ✅ **Fire-and-forget**：HTTP 请求触发后由后台跑 Promise，不阻塞主线程，不等待结果。
- ✅ **状态追踪**：依然通过数据库 `task_runs` 表追踪状态（Running -> Completed/Failed）。
- ✅ **前端体验一致**：前端依然使用 Smart Polling 轮询任务状态。

---

##  系统架构

```mermaid
graph TD
    A[Action / API] -- flowEngine.submit --> B[Promise (Async)]
    A -- insert --> C[task_runs DB]
    B -- execute --> D[Task Handler]
    D -- update status --> C
    Frontend -- poll --> C
```

**改变点**：
- ❌ **No Redis Queue**：不再依赖 Redis 队列。
- ❌ **No Worker Service**：没有独立的 Worker 进程。
- ❌ **No Persistence**：如果 Server 重启，这期间 `Running` 的任务会丢失（卡在 Running）。
    - *对于小规模自用系统，这是可接受的权衡。*
- ✅ **并发控制**：通过 `MAX_TASK_WORKER` 环境变量限制同时运行的任务数量（默认 10）。

---

## ⚙️ 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MAX_TASK_WORKER` | 最大并发任务数。设为 0 表示无限制 | `10` |

当达到最大并发数时，新提交的任务会进入等待队列，按 FIFO 顺序执行。

---

## 🚀 完整开发流程

### Step 1: 规划任务

只需要确认一件事：**任务逻辑**。
不需要再考虑队列类型（main/api），所有任务都在主进程异步执行。

### Step 2: 创建任务文件

**文件位置**：`src/features/<feature-name>/server/tasks/<task-name>.ts`

#### 2.1 定义任务类型
```typescript
export const TASK_TYPE = 'my_task_name';

export interface MyTaskInput {
    id: string;
}

export interface MyTaskOutput {
    result: string;
}
```

#### 2.2 实现 Handler
使用 `FlowTaskHandler` 接口并通过 `flowEngine` 注册：

```typescript
import { flowEngine, type FlowTaskHandler, type FlowContext } from '@/lib/flow';

const myTaskHandler: FlowTaskHandler<MyTaskInput, MyTaskOutput> = {
    // 1. 执行核心逻辑
    async execute(input, context) {
        // 验证逻辑（在 execute 内部处理）
        if (!input.id) throw new Error("Missing ID");
        
        // 更新进度 (可选，用户可见)
        await context.updateProgress('Processing...');
        
        // 调用 AI (使用内置 context.ai)
        const response = await context.ai.generate({
            prompt: 'Your system prompt',
            messages: [{ role: 'user', content: 'User message' }],
            model: 'gpt-4o-mini',  // 可选，默认使用环境变量 OPENAI_MODEL
            responseFormat: 'json_object',  // 可选
        });
        // Token 用量自动统计上报！
        
        return { result: response.content };
    },

    // 2. 完成回调 (可选，写入 DB，发送通知)
    async onComplete(output, input, context) {
        await db.update(...).set({ status: 'done' });
    },

    // 3. 错误回调 (可选)
    async onError(error, input, context) {
        console.error("Task failed", error);
    },

    // 4. 取消回调 (可选)
    async onCancel(input, context) {
        console.log("Task cancelled");
    }
};

// 注册任务
flowEngine.register(TASK_TYPE, myTaskHandler);
```

### Step 3: 确保注册

确保 `src/instrumentation.ts` 中 import 了你的任务文件：

```typescript
// src/instrumentation.ts
if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import("@/features/source-document/server/tasks/parse-source-document");
    await import("@/features/your-feature/server/tasks/my-task"); // <-- 添加这行
}
```

### Step 4: 触发任务

在 Server Action 中调用 `flowEngine.submit`：

```typescript
import { flowEngine } from '@/lib/flow';

export async function myAction(data: any) {
    // ... DB 操作 ...

    // 触发后台任务 (立即返回，不会 await 任务完成)
    const taskId = await flowEngine.submit(
        'my_task_name',           // 任务类型 (必须已注册)
        { id: '...' },            // 输入数据
        {
            title: 'Processing Data',
            ledgerId: '...',      // 可选：关联账本
        }
    );

    return { success: true, taskId };
}
```

---

## ⚠️ 注意事项

1.  **重启即丢失**：正在执行的任务如果遇到服务重启（部署），会被中断且不会自动重试。
2.  **超时问题**：虽然不会阻塞 HTTP，但如果任务运行时间极长（>几分钟），Node.js 进程本身可能被 Serverless 平台杀掉（如果是 Vercel）。但在 Docker/VPS 环境下通常没问题。

---

## 🚨 错误处理最佳实践

### ❌ 不要做：在业务层 try-catch 底层错误

```typescript
// ❌ 错误示范
async execute(input, context) {
    try {
        const result = await context.ai.generate({...});
        return { ...result };
    } catch (error) {
        logger.error({ error }, "AI failed");
        throw error;  // 这个 try-catch 毫无意义
    }
}
```

**原因**：
- 底层错误（网络、API Key、模型不存在、余额不足）业务层无法处理
- 框架会自动捕获异常并调用 `onError`
- 手动 try-catch 再 throw 毫无意义

### ✅ 应该做：让异常自然传播

```typescript
// ✅ 正确示范
async execute(input, context) {
    // 直接调用，异常自动传播到 onError
    const { content } = await context.ai.generate({...});
    const parsed = JSON.parse(content);
    return { result: parsed };
},

// onError 处理业务层的回退逻辑
async onError(error, input, context) {
    logger.error({ err: error }, "Task failed");
    // 设置默认状态，避免 UI 卡住
    await db.update(...)
        .set({ status: 'failed', icon: 'Package' });
}
```

**原则**：
- `execute` 只做正常逻辑，不处理异常
- `onError` 处理失败后的业务回退（如设置默认值）
- 框架负责状态转换（Running → Failed）

---

## 🔄 文档维护
- **创建时间**: 2026-02-02
- **最后更新**: 2026-02-05 (添加错误处理最佳实践)
