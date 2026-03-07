# 错误代码 (AnomalyCode) 扩展指南

本文档介绍如何在来源文档（Source Document）处理流程中增加新的错误状态代码（Anomaly Code）。

## 概览

来源文档共有 `queued`, `processing`, `completed`, `anomaly` 四种基本状态。当状态为 `anomaly` 时，我们通过 `anomalyCodes` 数组来提供更细粒度的错误原因。

-   `internal_error`: 系统内部错误（AI 服务超时、数据库异常、内容解析失败等）
-   `invalid_content`: 非有效流水（输入不含财务信息）

## 增加步骤

如果要增加一个新的错误代码（例如 `rate_limit_exceeded`），请遵循以下四个步骤：

### 1. 更新数据库 Schema

在 `src/features/source-document/server/schema.ts` 中更新 `anomalyCodeEnum`：

```typescript
// src/features/source-document/server/schema.ts
// SQLite 使用 text 类型存储枚举值，在 TypeScript 层面定义类型
export type AnomalyCode = 
  | "internal_error" 
  | "invalid_content" 
  | "evidence_anomaly"
  | "rate_limit_exceeded"; // 新增
```

> [!IMPORTANT]
> 更新 Schema 后，需要运行 `npx drizzle-kit push` 同步数据库。如果是生产环境，请确保数据迁移安全。

### 2. 更新逻辑捕获

在 `src/features/source-document/server/tasks/parse-source-document.ts` 的处理逻辑中，根据异常信息推入该错误码。由于 `anomalyCodes` 是一个数组，你可以添加多个错误码。

```typescript
// src/features/source-document/server/tasks/parse-source-document.ts
async execute(input, context) {
    try {
        // ... processing logic
    } catch (error) {
         let anomalyCode = "internal_error";
         if (error.message.includes("rate limit")) {
             anomalyCode = "rate_limit_exceeded";
         }
         // 更新文档状态为 anomaly 并添加错误码
         // 注意：具体实现可能依赖 repository 或 updates
    }
}
```

### 3. 添加国际化翻译

在 `messages/zh.json` 和 `messages/en.json` 中添加对应的错误描述：

```json
// messages/zh.json
"AnomalyCode": {
    "rate_limit_exceeded": "请求过于频繁",
    // ...
}
```

## UI 显示说明

-   系统会自动根据 `anomalyCodes` 在 `SourceDocumentCard` 中查找对应的国际化文本。
-   错误信息将替代原有的“处理异常”标签，并以红色圆点样式显示。
-   所有 `anomaly` 状态的记录都会自动显示“重试”和“删除”按钮。

## 测试建议

增加新错误码后，请通过以下测试确保逻辑正确：
- **Hook 测试**: `tests/unit/hooks/useUnifiedSourceDocuments.test.tsx` - 验证前端 Hook 能正确处理新的状态和错误码组合。
- **Action 测试**: `tests/integration/source-document-actions.test.ts` - 验证后端存储和检索错误码的逻辑。
- **Schema 验证**: 确保 `tests/helpers/schema-setup.ts`（如果存在）或测试环境已同步最新的 Enum 定义。
