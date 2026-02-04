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
        
        // 调用 AI 或 复杂计算
        await context.updateProgress('Processing...');
        const result = await someService.process(input.id);
        
        // 上报 token 消耗（可选）
        context.reportTokens({ model: 'gpt-4o', input: 100, output: 50 });
        
        return { result };
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
2.  **错误处理**：确保 `execute` 内部做好 try-catch，虽然 Runner 会兜底捕获并标记为 Failed，但业务逻辑最好自己处理预期内的错误。
3.  **超时问题**：虽然不会阻塞 HTTP，但如果任务运行时间极长（>几分钟），Node.js 进程本身可能被 Serverless 平台杀掉（如果是 Vercel）。但在 Docker/VPS 环境下通常没问题。

---

## 🔄 文档维护
- **创建时间**: 2026-02-02
- **最后更新**: 2026-02-04 (Updated to FlowEngine API)
