# Processing Task Infrastructure Development Guide

This guide provides a comprehensive overview of the processing task infrastructure designed for decoupled, robust, and asynchronous task management.

## 🏗 Architecture Overview

The infrastructure is split into two main parts:
1. **Core Infrastructure (`src/lib/processing/`)**: A pure, business-agnostic engine responsible for task queuing, execution coordination, and state management.
2. **Task Implementations (`src/lib/tasks/`)**: Where business-specific logic resides (e.g., source document parsing, summarization).

### The Data Flow
```mermaid
graph LR
    A[Business Layer] -- createProcessingTask --> B[processing_tasks DB]
    B -- trigger --> C[Task Worker]
    C -- load handler --> D[Task Handler]
    D -- execute steps --> E[GPT / External Service]
    E -- return --> D
    D -- write back --> F[Business Entity]
    D -- update status --> B
```

---

## 🛠 Implementing a New Task

To add a new feature powered by processing tasks, follow these steps:

### 1. Define Input/Output Types
Create a file in `src/lib/tasks/` (e.g., `my-feature.ts`).

```typescript
export interface MyFeatureInput {
  entityId: string;
  options: Record<string, any>;
}
```

### 2. Implement `ProcessingTaskHandler`
Implement the `ProcessingTaskHandler` interface.

```typescript
import { registerProcessingTask, ProcessingTaskHandler } from "@/lib/processing";

const myFeatureHandler: ProcessingTaskHandler<string> = {
  // 1. Core Logic
  async execute(task, context) {
    const input = task.input as MyFeatureInput;
    
    // Use context to track progress
    await context.updateProgress({ currentStep: "analyzing" });
    
    // Call GPT or perform logic...
    const result = "Task output";
    
    return result;
  },

  // 2. Business Write-back
  async onComplete(output, task) {
    // Final validation: entityId exists?
    // Update business table (e.g., ledger_entries, source_documents)...
  },

  // 3. Error Cleanup
  async onError(error, task) {
    // Mark business entity as failed...
  }
};

// 3. Register IT
registerProcessingTask("my_feature_type", myFeatureHandler);
```

### 3. Register in Tasks Index
Import your file in `src/lib/tasks/index.ts` to ensure it registers at startup.

---

## 📡 Using Tasks in Business Logic

### Create a Task
```typescript
import { createProcessingTask } from "@/lib/processing";

const { taskId } = await createProcessingTask({
  type: "my_feature_type",
  title: "Analyzing something...",
  ledgerId: ledgerId,
  entityId: recordId,
  entityType: "my_entity", // Optional metadata
  input: { ... },
});
```

### Track Progress (Frontend)
Use `getRecentProcessingTasks(ledgerId)` to get the latest status. The `TaskCenter` component already displays this information for any task type.

---

## 🛡 Best Practices

### 1. Final Commit Validation
**Always** re-verify the existence and status of your business entity in `onComplete` or at the end of `execute`.
> Processing execution (especially with LLMs) is slow; the world might have changed while the task was running (e.g., user deleted the record).

### 2. Best-Effort Semantics
The processing infrastructure does **not** guarantee retries.
- If it fails, it marks the task as `failed`.
- The UI should detect `failed` state and offer a "Retry" button that creates a **new** task.

### 3. Progress Tracking
Use `context.updateProgress` to report current step for monitoring and debugging. This is **informational only** and does **not** support resumption from failure.

### 4. Purity
Do **not** import business models (`source_documents`, `ledger_entries`, etc.) inside `src/lib/processing`. Keep those imports strictly within `src/lib/tasks`.

### 5. Defensive AI Interaction
**Never** trust the response from an AI model. Always assume it could be untrustworthy, hallucinated, or malformed.
- **Explicit Verification**: Always validate the AI's content (schema, values, logic) before performing any business write-back.
- **Handle Illegal Content**: Design a clear failure path for when AI output is invalid. Do not let the system enter an inconsistent state.
- **Defensive Parsing**: Use robust parsing (e.g., `try-catch` around JSON parsing, schema validation like Zod) and handle errors gracefully.

### 6. Concurrency Configuration
The number of concurrent worker loops can be controlled via the environment variable:
- `PROCESSING_WORKER_COUNT`: Set this in your `.env` files (default is 1).
