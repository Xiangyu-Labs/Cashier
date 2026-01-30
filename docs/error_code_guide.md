# 错误代码 (ErrorCode) 扩展指南

本文档介绍如何在来源文档（Source Document）处理流程中增加新的错误状态代码。

## 概览

来源文档共有 `queued`, `processing`, `completed`, `error` 四种基本状态。当状态为 `error` 时，我们通过 `errorCode` 枚举来提供更细粒度的错误原因。

- `internal_error`: 系统内部错误（AI 服务超时、数据库异常、内容解析失败等）
- `invalid_content`: 非有效流水（输入不含财务信息）

## 增加步骤

如果要增加一个新的错误代码（例如 `rate_limit_exceeded`），请遵循以下四个步骤：

### 1. 更新数据库 Schema
在 `src/lib/db/schema.ts` 中更新 `errorCodeEnum`：

```typescript
// src/lib/db/schema.ts
export const errorCodeEnum = pgEnum("error_code", [
  "internal_error",
  "invalid_content",
  "evidence_anomaly",
  "rate_limit_exceeded", // 新增
]);
```

> [!IMPORTANT]
> 更新 Schema 后，需要运行 `npx drizzle-kit push` 同步数据库。如果是生产环境，请确保数据迁移安全。

### 2. 更新 API 类型定义
在 `src/types/api.ts` 中同步更新 `SourceDocument` 接口：

```typescript
// src/types/api.ts
export interface SourceDocument {
  // ...
  errorCode?: "internal_error" | "invalid_content" | "evidence_anomaly" | "rate_limit_exceeded" | null;
}
```

### 3. 后端逻辑捕获
在 `src/lib/tasks/parse-source-document.ts` 的 `onError` 或 `onComplete` 回调中，根据异常信息设置该错误码：

```typescript
// src/lib/tasks/parse-source-document.ts
async onError(error: Error, task: ProcessingTask) {
    let errorCode: "internal_error" | "evidence_anomaly" | "rate_limit_exceeded" = "internal_error";
    
    if (error.message.includes("rate limit")) {
        errorCode = "rate_limit_exceeded";
    }
    // ...
}
```

### 4. 添加国际化翻译
在 `messages/zh.json` 和 `messages/en.json` 中添加对应的错误描述：

```json
// messages/zh.json
"ErrorCode": {
    "rate_limit_exceeded": "请求过于频繁",
    // ...
}
```

## UI 显示说明

- 系统会自动根据 `errorCode` 在 `SourceDocumentCard` 中查找对应的国际化文本。
- 错误信息将替代原有的“处理异常”标签，并以红色圆点样式显示。
- 所有 `error` 状态的记录都会自动显示“重试”和“删除”按钮。

## 测试建议

增加新错误码后，请更新以下测试文件以确保逻辑正确：
- `tests/unit/components/SourceDocumentCard.test.tsx`: 验证 UI 能够正确显示新翻译。
- `tests/helpers/schema-setup.ts`: 确保测试数据库也能识别新的 Enum 值。
