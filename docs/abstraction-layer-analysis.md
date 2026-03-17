# Task Flow 系统抽象层次评估报告

**评估日期**: 2026-03-17
**评估范围**: `src/lib/flow/` 及其相关实现

---

## 1. 当前架构概览

```
应用层：Task Handlers (parse-source-document, categorize-entry, etc.)
    ↓ 实现
引擎层：Flow Engine (任务生命周期、并发控制)
    ↓ 使用
适配器层：StorageAdapter (Drizzle 实现)
    ↓ 操作
数据库：taskRuns 表
```

---

## 2. 关键抽象点评估

### 2.1 StorageAdapter 接口

**当前状态**:

```typescript
export interface StorageAdapter {
  create(task: TaskInput): Promise<string>;
  update(id: string, data: Partial<TaskRecord>): Promise<void>;
  get(id: string): Promise<TaskRecord | null>;
  list(filter?: TaskFilter): Promise<TaskRecord[]>;
}
```

**评估**:

- **抽象成本**: 高
  - 需要维护接口定义
  - 需要类型映射层 (`mapToTaskRecord`)
  - 运行时验证逻辑 (Zod schemas)
- **实际收益**: 低
  - 只有一个 Drizzle 实现
  - 无替换需求（SQLite 是项目核心选择）
  - 测试使用内存 SQLite，不需要 Mock Storage

**结论**: **过早抽象** - 建议删除接口，直接使用 Drizzle 操作。

---

### 2.2 FlowContext.ai (AI 能力注入)

**当前状态**:

```typescript
export interface FlowContext {
  taskId: string;
  signal: AbortSignal;
  reportTokens: (usage: TokenUsage) => void;
  updateProgress: (message: string) => Promise<void>;
  ai: AIContext; // 内置 AI 能力
}
```

**评估**:

- **抽象成本**: 中
  - AIContext 与 Flow Engine 耦合
  - 所有任务都继承 AI 依赖，即使不需要 AI 的任务
- **实际收益**: 高
  - 100% 的任务使用 AI
  - 统一 token 统计、JSON 修复、模型 tier 解析
  - 取消信号自动传播

**结论**: **合理抽象** - 但应考虑将 AI 作为必需依赖明确化。

---

### 2.3 TaskInput 的 scopeId/entityType/entityId

**当前状态**:

```typescript
export interface TaskInput {
  type: string;
  title?: string | null;
  input?: unknown;
  scopeId?: string | null; // 租户隔离
  entityType?: string | null; // 实体类型
  entityId?: string | null; // 实体 ID
}
```

**评估**:

- **抽象成本**: 低
  - 数据库表需要这些字段
  - 查询时需要这些索引
- **实际收益**: 高
  - `scopeId`: 租户隔离，所有任务都需要
  - `entityType`/`entityId`: 用于关联查询（如查找某文档的所有任务）

**使用统计**:

- `scopeId`: 100% 任务使用（ledgerId）
- `entityType`/`entityId`: 用于 source document retry、batch operations

**结论**: **合理抽象** - 这三个字段构成了任务系统的核心关联能力。

---

### 2.4 Logger 注入

**当前状态**:

```typescript
// 直接导入全局 logger
import { logger } from "@/lib/logger";
```

**评估**:

- **抽象成本**: 低（当前方式）
- **实际收益**: 中
  - Pino 已经是结构化日志
  - 测试时通过 vi.mock 可以替换
  - 但缺乏按任务实例的上下文注入

**问题**:

```typescript
// 当前：所有任务共享全局 logger
logger.info({ taskId }, "Task completed");

// 理想：logger 自动绑定 taskId
context.logger.info("Task completed"); // 自动包含 taskId
```

**结论**: **抽象不足** - 建议通过 FlowContext 注入带上下文的 logger。

---

### 2.5 环境变量读取

**当前状态**:

```typescript
// 模块级别直接读取
const maxConcurrentTasks = parseInt(process.env.MAX_TASK_WORKER || "10", 10);

// ai-context.ts
const modelMap: Record<AIModelTier, string | undefined> = {
  text: process.env.AI_MODEL_TEXT,
  vision: process.env.AI_MODEL_VISION,
};
```

**评估**:

- **抽象成本**: 低（当前方式）
- **问题**:
  - 难以测试（需要修改 process.env）
  - 配置分散在各模块
  - 启动时无法验证配置完整性

**结论**: **抽象不足** - 建议集中配置并通过构造函数注入。

---

## 3. 抽象层次调整建议

### 3.1 删除 StorageAdapter 接口

**理由**:

- 只有一个实现，无替换需求
- 增加不必要的类型映射层
- 测试使用内存 SQLite，不需要 Mock

**重构后代码**:

```typescript
// src/lib/flow/storage.ts
import { db } from '@/lib/db'
import { taskRuns } from '@/lib/db/schema'

export async function createTaskRecord(task: TaskInput): Promise<string> {
  const [record] = await db.insert(taskRuns).values({...}).returning({ id: taskRuns.id })
  return record.id
}

export async function updateTaskRecord(id: string, data: Partial<TaskRecord>): Promise<void> {
  await db.update(taskRuns).set({...}).where(eq(taskRuns.id, id))
}
// ... 其他操作
```

---

### 3.2 集中配置管理

**建议结构**:

```typescript
// src/lib/flow/config.ts
export interface FlowConfig {
  maxConcurrentTasks: number;
  aiModels: {
    text: string;
    vision: string;
  };
  retryConfig: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export function loadFlowConfig(): FlowConfig {
  return {
    maxConcurrentTasks: parseInt(process.env.MAX_TASK_WORKER || "10", 10),
    aiModels: {
      text: requireEnv("AI_MODEL_TEXT"),
      vision: requireEnv("AI_MODEL_VISION"),
    },
    retryConfig: {
      maxRetries: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
      baseDelayMs: parseInt(process.env.AI_RETRY_DELAY_MS || "1000", 10),
    },
  };
}
```

---

### 3.3 上下文 Logger

**建议实现**:

```typescript
export interface FlowContext {
  taskId: string
  signal: AbortSignal
  logger: Logger  // 绑定 taskId 的 logger
  ai: AIContext
  updateProgress: (message: string) => Promise<void>
}

// 创建时自动绑定
function createContext(taskId: string, config: FlowConfig): FlowContext {
  return {
    taskId,
    signal: controller.signal,
    logger: logger.child({ taskId }),  // Pino 的 child logger
    ai: createAIContext(...),
    updateProgress: async (msg) => { ... }
  }
}
```

---

### 3.4 保留的扩展点

以下抽象应保留，但需明确其定位：

1. **Task Handler 接口** - 应用层扩展点
2. **AIContext 接口** - 允许未来支持多模型提供商
3. **onComplete/onError/onCancel 钩子** - 生命周期管理

---

## 4. 重构后的理想代码结构

```
src/lib/flow/
├── index.ts              # 导出公共 API，创建默认实例
├── engine.ts             # 核心引擎（简化版）
├── config.ts             # 配置类型和加载
├── storage.ts            # Drizzle 存储操作（无接口）
├── ai-context.ts         # AI 能力封装
├── types.ts              # 公共类型定义
├── monitoring.ts         # 监控指标
└── json-utils.ts         # JSON 处理工具
```

**引擎初始化**:

```typescript
// src/lib/flow/index.ts
import { loadFlowConfig } from "./config";
import { createFlowEngine } from "./engine";

const config = loadFlowConfig();
export const flowEngine = createFlowEngine(config);
```

**引擎实现**:

```typescript
// src/lib/flow/engine.ts
export function createFlowEngine(config: FlowConfig): FlowEngine {
  // 直接使用 storage 函数，不通过接口
  // 通过 config 获取所有配置，不读取 process.env
  // 注入带上下文的 logger
}
```

---

## 5. 评估总结

| 抽象点                      | 当前状态 | 建议                  | 优先级 |
| --------------------------- | -------- | --------------------- | ------ |
| StorageAdapter 接口         | 过早抽象 | **删除**              | 高     |
| FlowContext.ai              | 合理     | 保留，明确为必需      | -      |
| scopeId/entityType/entityId | 合理     | 保留                  | -      |
| Logger 注入                 | 抽象不足 | **通过 Context 注入** | 中     |
| 环境变量读取                | 抽象不足 | **集中配置管理**      | 中     |

**核心原则**:

1. **YAGNI**: 没有多实现的接口不要抽象
2. **显式优于隐式**: 配置通过参数传递，不依赖全局状态
3. **上下文传递**: Logger 等横切关注点通过 Context 注入
