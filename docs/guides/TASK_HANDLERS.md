# Task Handler Guide

This document describes how to create and register background task handlers in Cashier.

## Overview

Cashier uses an in-process task engine (`src/lib/flow/`) for background processing. Tasks run as Promises within the Next.js process — no external queue (Redis, RabbitMQ, etc.) required.

## Task Registration

Tasks are registered centrally via `src/lib/flow/task-registry.ts`, and `src/instrumentation.ts` calls that registry during startup.

### Current Registered Tasks

The following tasks are registered by the task registry:

- `parse_source_document` - Parses uploaded receipts and documents
- `generate_category_metadata` - Generates icon and description for categories
- `categorize_entry` - Auto-categorizes ledger entries

## Creating a Task Handler

### 1. Create Task File

Create a file in your feature's `server/tasks/` directory:

```typescript
// src/features/my-feature/server/tasks/process-document.ts
import type { FlowTaskDefinition } from "@/lib/flow";
import { logger } from "@/lib/logger";
import { throwIfCancelled } from "@/lib/flow/cancellation";

// Define task handler
const processDocumentHandler = {
  async execute(input, context) {
    // Task logic here
    const { documentId } = input as { documentId: string };

    // Report progress (visible in UI)
    await context.updateProgress("Analyzing document...");

    // Check for cancellation
    throwIfCancelled(context.signal);

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
};

export const processDocumentTaskDefinition: FlowTaskDefinition<unknown, unknown> = {
  type: "process-document",
  handler: processDocumentHandler,
};
```

### 2. Register in the Task Registry

Add your task definition to `src/lib/flow/task-registry.ts`:

```typescript
flowEngine.register(processDocumentTaskDefinition.type, processDocumentTaskDefinition.handler);
```

### 3. Submit Tasks

Submit tasks from Server Actions or other parts of your code:

```typescript
import { flowEngine } from "@/lib/flow";

// Submit a task
const taskId = await flowEngine.submit(
  "process-document", // task type (must match registration)
  { documentId: "doc-123" }, // input payload
  {
    title: "Process Document", // display title
    scopeId: ledgerId, // tenant scope
    entityType: "source_document", // entity type
    entityId: "doc-123", // entity ID
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

| Method                            | Description                           |
| --------------------------------- | ------------------------------------- |
| `context.updateProgress(message)` | Update progress message (shown in UI) |
| `context.reportTokens(usage)`     | Report token usage for AI calls       |
| `context.signal`                  | AbortSignal for cancellation support  |

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
import { type FlowTaskDefinition, type FlowTaskHandler } from "@/lib/flow";

const processDocumentHandler: FlowTaskHandler<ProcessDocumentInput, ProcessDocumentOutput> = {
  async execute(input, context): Promise<ProcessDocumentOutput> {
    const { documentId, options } = input;
    // ... process
    return {
      extractedText: "...",
      totalAmount: 100,
      entries: [...],
    };
  },
};

export const processDocumentTaskDefinition: FlowTaskDefinition<
  ProcessDocumentInput,
  ProcessDocumentOutput
> = {
  type: "process-document",
  handler: processDocumentHandler,
};
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
    throwIfCancelled(context.signal);

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

Write unit tests against the exported handler or task definition:

```typescript
// tests/unit/my-feature/tasks/process-document.test.ts
import { describe, it, expect, vi } from "vitest";
import { processDocumentTaskDefinition } from "@/features/my-feature/server/tasks/process-document";

describe("process-document task", () => {
  it("should process document successfully", async () => {
    // Mock context
    const mockContext = {
      updateProgress: vi.fn(),
      reportTokens: vi.fn(),
      signal: { aborted: false },
      ai: {
        generate: vi.fn(),
      },
    };

    const result = await processDocumentTaskDefinition.handler.execute(
      { documentId: "doc-123" },
      mockContext as never
    );

    // Assert
    expect(result).toBeDefined();
    expect(mockContext.updateProgress).toHaveBeenCalled();
  });
});
```

## Troubleshooting

### Task not found

If you see "Task type not found" errors:

1. Verify the task definition is registered in `src/lib/flow/task-registry.ts`
2. Ensure the task type name matches in the task definition and `flowEngine.submit()`
3. Confirm startup completed successfully and `src/instrumentation.ts` did not abort

### Task not executing

1. Check the server logs for registration messages
2. Verify `src/lib/flow/task-registry.ts` includes the task definition
3. Ensure `process.env.NEXT_RUNTIME === 'nodejs'` for server-side execution

### Task errors not shown

Errors in tasks are caught and stored. Check the task status:

```typescript
const status = await flowEngine.getStatus(taskId);
if (status.error) {
  console.error("Task failed:", status.error);
}
```
