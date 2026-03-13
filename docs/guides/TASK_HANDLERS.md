# Task Handler Guide

This document describes how to create and register background task handlers in Cashier.

## Overview

Cashier uses an in-process task engine (`src/lib/flow/`) for background processing. Tasks run as Promises within the Next.js process — no external queue (Redis, RabbitMQ, etc.) required.

## Auto-Discovery

Task handlers are **automatically discovered** at startup from files matching:

```
**/server/tasks/*.task.ts
```

No manual registration is required!

## Creating a Task Handler

### 1. Create Task File

Create a file in your feature's `server/tasks/` directory:

```typescript
// src/features/my-feature/server/tasks/process-document.task.ts
import { flowEngine } from "@/lib/flow";
import { logger } from "@/lib/logger";

// Export a default function that registers the task
export default function register(engine: typeof flowEngine) {
  engine.register("process-document", {
    async execute(input, context) {
      // Task logic here
      const { documentId } = input as { documentId: string };

      // Report progress (visible in UI)
      await context.updateProgress("Analyzing document...");

      // Check for cancellation
      if (context.signal.aborted) {
        throw new Error("Task cancelled");
      }

      // Perform work
      const result = await analyzeDocument(documentId);

      // Report token usage (for AI calls)
      context.reportTokens({
        model: "gpt-4o",
        input: 1000,
        output: 500,
      });

      return result;
    },
  });
}
```

### 2. Submit Tasks

Submit tasks from Server Actions or other parts of your code:

```typescript
import { flowEngine } from "@/lib/flow";

// Submit a task
const taskId = await flowEngine.submit(
  "process-document",        // task type (must match registration)
  { documentId: "doc-123" }, // input payload
  {
    title: "Process Document",           // display title
    scopeId: ledgerId,                   // tenant scope
    entityType: "source_document",       // entity type
    entityId: "doc-123",                 // entity ID
  }
);

// Check task status
const status = await flowEngine.getStatus(taskId);
```

## Task Handler Structure

### Execute Function

```typescript
async execute(
  input: unknown,                    // Input payload from submit()
  context: TaskContext                // Execution context
): Promise<unknown>                   // Return result
```

### Context Methods

| Method | Description |
|--------|-------------|
| `context.updateProgress(message)` | Update progress message (shown in UI) |
| `context.reportTokens(usage)` | Report token usage for AI calls |
| `context.signal` | AbortSignal for cancellation support |

### Input/Output Types

Define types for your task inputs and outputs:

```typescript
// src/features/my-feature/server/tasks/types.ts
export interface ProcessDocumentInput {
  documentId: string;
  options?: {
    language?: string;
  };
}

export interface ProcessDocumentOutput {
  extractedText: string;
  totalAmount: number;
  entries: Array<{
    itemName: string;
    amount: number;
  }>;
}

// In your task file
import { ProcessDocumentInput, ProcessDocumentOutput } from "./types";

export default function register(engine: typeof flowEngine) {
  engine.register("process-document", {
    async execute(input, context): Promise<ProcessDocumentOutput> {
      const { documentId, options } = input as ProcessDocumentInput;
      // ... process
      return {
        extractedText: "...",
        totalAmount: 100,
        entries: [...],
      };
    },
  });
}
```

## Best Practices

### 1. Idempotency

Tasks should be idempotent — running the same task multiple times should produce the same result:

```typescript
async execute(input, context) {
  const { documentId } = input as { documentId: string };

  // Check if already processed
  const existing = await db.query.results.findFirst({
    where: eq(results.documentId, documentId),
  });

  if (existing) {
    logger.info({ documentId }, "Document already processed");
    return existing;
  }

  // ... process
}
```

### 2. Error Handling

Use specific error types and always log:

```typescript
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

async execute(input, context) {
  try {
    // ... work
  } catch (error) {
    logger.error({ error, input }, "Task failed");

    // Re-throw as AppError for consistent handling
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Processing failed",
      "PROCESSING_ERROR",
      500,
      { originalError: String(error) }
    );
  }
}
```

### 3. Progress Updates

Keep users informed of progress:

```typescript
async execute(input, context) {
  await context.updateProgress("Step 1: Reading document...");
  await step1();

  await context.updateProgress("Step 2: Analyzing content...");
  await step2();

  await context.updateProgress("Step 3: Extracting data...");
  await step3();

  return result;
}
```

### 4. Cancellation Support

Check for cancellation during long-running operations:

```typescript
async execute(input, context) {
  for (const item of items) {
    if (context.signal.aborted) {
      logger.info("Task cancelled by user");
      throw new Error("Task cancelled");
    }

    await processItem(item);
  }
}
```

### 5. Token Tracking

For AI-powered tasks, report token usage:

```typescript
async execute(input, context) {
  const response = await openai.chat.completions.create({...});

  context.reportTokens({
    model: response.model,
    input: response.usage?.prompt_tokens ?? 0,
    output: response.usage?.completion_tokens ?? 0,
  });

  return response.choices[0].message.content;
}
```

## Testing Task Handlers

Write unit tests for your task handlers:

```typescript
// tests/unit/my-feature/tasks/process-document.test.ts
import { describe, it, expect, vi } from "vitest";
import register from "@/features/my-feature/server/tasks/process-document.task";
import { flowEngine } from "@/lib/flow";

describe("process-document task", () => {
  it("should process document successfully", async () => {
    // Register task
    register(flowEngine);

    // Mock context
    const mockContext = {
      updateProgress: vi.fn(),
      reportTokens: vi.fn(),
      signal: { aborted: false },
    };

    // Get registered handler
    const handler = vi.mocked(flowEngine.register).mock.calls[0][1];

    // Execute
    const result = await handler.execute(
      { documentId: "doc-123" },
      mockContext
    );

    // Assert
    expect(result).toBeDefined();
    expect(mockContext.updateProgress).toHaveBeenCalled();
  });
});
```

## Migration from Manual Registration

If you have existing tasks using the old manual import pattern in `instrumentation.ts`:

### Before

```typescript
// src/instrumentation.ts
await import("@/features/my-feature/server/tasks/my-task");

// src/features/my-feature/server/tasks/my-task.ts
import { flowEngine } from "@/lib/flow";
flowEngine.register("my-task", { ... });
```

### After

```typescript
// src/features/my-feature/server/tasks/my-task.task.ts
import { flowEngine } from "@/lib/flow";

export default function register(engine: typeof flowEngine) {
  engine.register("my-task", { ... });
}
```

Just rename the file to `*.task.ts` and export a default function — no `instrumentation.ts` changes needed!

## Troubleshooting

### Task not found

If you see "Task type not found" errors:

1. Verify the file matches the pattern `**/server/tasks/*.task.ts`
2. Check that the file exports a default function
3. Ensure the task type name matches in `engine.register()` and `flowEngine.submit()`

### Task not executing

1. Check the server logs for registration messages
2. Verify `autoRegisterTasks()` is called in `instrumentation.ts`
3. Ensure `process.env.NEXT_RUNTIME === 'nodejs'` for server-side execution

### Task errors not shown

Errors in tasks are caught and stored. Check the task status:

```typescript
const status = await flowEngine.getStatus(taskId);
if (status.error) {
  console.error("Task failed:", status.error);
}
```
