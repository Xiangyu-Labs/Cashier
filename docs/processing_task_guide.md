# Processing Task Infrastructure Development Guide (v2.0 - BullMQ Flow)

This guide provides a comprehensive overview of the new **async recursive flow task system** powered by BullMQ and Redis.

## 🏗 Architecture Overview

The system replaces the legacy database-polling model with a robust message queue architecture:

1.  **Core Engine (`src/lib/flow/`)**: Manages task queuing, execution, recursion, and state persistence.
2.  **Task Implementations (`src/features/<feature>/server/tasks/`)**: Pure business logic implementing the `FlowTaskHandler` interface.
3.  **Redis**: Handles job storage, sophisticated rate limiting, and stall prevention.

### The Data Flow

```mermaid
graph TD
    A[Business Layer] -- submitFlowTask --> B[Redis (BullMQ)]
    A -- creates --> C[task_runs DB]
    B -- trigger --> D[Worker (Main/API)]
    D -- execute --> E[Task Handler]
    E -- returns Result --> F[Complete Task]
    E -- returns FlowDefinition --> G[Spawn Children (Recursion)]
    F -- update --> C
```

---

## 🛠 Implementing a New Task

To add a new feature, implement the `FlowTaskHandler` interface and place it in the appropriate feature directory.

### 1. Define Types

Create a file in your feature's server tasks directory (e.g., `src/features/my-feature/server/tasks/my-task.ts`).

```typescript
export const TASK_TYPE = 'my_feature_task';

export interface MyInput {
    entityId: string;
    shouldRecurse?: boolean;
}

export interface MyOutput {
    result: string;
}
```

### 2. Implement Handler

```typescript
import { registerFlowTask, FlowTaskHandler, FlowContext, FlowDefinition } from "@/lib/flow";

const handler: FlowTaskHandler<MyInput, MyOutput> = {
    // 0. Pre-validation (Optional)
    async validate(input, context) {
        // Check if entity exists
        if (!input.entityId) throw new Error("Missing ID");
    },

    // 1. Main Execution
    async execute(input, context) {
        await context.updateProgress({ currentStep: "processing" });

        // Example: Recursion
        if (input.shouldRecurse) {
            return {
                name: TASK_TYPE,
                title: "Child Task",
                queueName: 'main',
                data: { entityId: input.entityId, shouldRecurse: false }
            } as FlowDefinition;
        }

        return { result: "Success" };
    },

    // 2. Lifecycle Hooks
    async onComplete(output, input, context) {
        // Write result to DB (MUST BE IDEMPOTENT)
        console.log("Task Completed:", output);
    },

    async onError(error, input, context) {
        // Handle failure (cleanup)
        console.error("Task Failed:", error);
    }
};

// 3. Register IT
registerFlowTask(TASK_TYPE, handler);
```

### 3. Ensure Auto-Import

Make sure your task file is imported at runtime so `registerFlowTask` is executed. Usually, this is handled by importing the feature's tasks in a central worker entry point or `instrumentation.ts`.

---

## 🛰 Using Tasks

### Submit a Task

```typescript
import { submitFlowTask } from "@/lib/flow/producer";
import { TASK_TYPE } from "@/features/my-feature/server/tasks/my-task";

await submitFlowTask({
    type: TASK_TYPE,
    title: "My Feature Task",
    ledgerId: "...",
    data: { entityId: "123", shouldRecurse: true },
    queueName: 'main' // or 'api'
});
```

### Monitoring from Frontend

Currently, we use a **Smart Polling** strategy combined with **Web Push Notifications** instead of SSE to track background task completion:

1.  **Smart Polling**: Use the `useSmartPolling` hook (or `useUnifiedSourceDocuments` if applicable). It polls the server at a set interval (e.g., 3s) only while there are active tasks.
2.  **Web Push**: In the task's `onComplete` or `onError` lifecycle hooks, call `sendNotificationToUser` to signal completion to all of the user's subscribed devices.

---

## ⚙️ Key Concepts

### Global Concurrency (Shared Resources)

The system uses a **Global Resource Pool** model. All tasks from all users are managed in shared queues. Concurrency limits are applied at the worker/system level, not per user.

- **Main Queue Concurrency**: Controlled by `FLOW_MAIN_QUEUE_CONCURRENCY`. Limits total simultaneous business logic executions.
- **API Queue Concurrency**: Controlled by `FLOW_API_QUEUE_CONCURRENCY`. Limits simultaneous outgoing calls to AI models to prevent provider-side rate limiting.
- **Global Rate Limiting**: `FLOW_API_QUEUE_RATE_MAX` and `FLOW_API_QUEUE_RATE_DURATION` provide an extra layer of protection (e.g., max 10 requests per minute project-wide).

### Recursion & Flow Definitions
Instead of linear steps, a task can return a `FlowDefinition` (or array of them). The system will:
1.  Pause the parent task.
2.  Spawn child tasks in BullMQ.
3.  Wait for all children to complete.
4.  Resume the parent task (triggering `onChildrenCompleted` if defined, or returning children results to `execute` logic if handled there).

### Dual Queues
-   **Main Queue**: For CPU-intensive or general business logic. High concurrency.
-   **API Queue**: For external API calls (OpenAI, etc.). Rate-limited to prevent 429 errors.

### Idempotency
`onComplete` may be called multiple times in rare network partition cases. Ensure your database writes safely handle duplicates (e.g., check before insert).

## 🛡 Best Practices

1.  **Strict Typing**: Always define Input/Output interfaces.
2.  **Graceful Cancellation**: Implement `onCancel` to clean up resources if a user cancels a long-running task.
3.  **Defensive AI**: Never trust AI output. Validate schema in `execute` before returning.
4.  **Resource Aware**: Be mindful that increasing concurrency variables in `.env` affects memory and API billing globally.
