// GPT Task Types - General purpose task infrastructure
// Best-effort execution: GPT infra runs tasks and records results
// Business layer is responsible for recovery/retry decisions

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

// Progress tracking structure (stored in JSONB)
export interface TaskProgress {
    currentStep?: string;
    completedSteps?: string[];
    totalSteps?: number;
    data?: unknown;
}

// Core task interface (maps to gpt_tasks table)
export interface GptTask {
    id: string;
    type: string;              // Flexible task type
    title: string;
    ledgerId: string | null;
    entityId: string | null;   // Generic entity reference
    entityType: string | null; // Type of entity (e.g., "receipt", "transaction")
    status: TaskStatus;
    error: string | null;
    input: unknown;
    output: unknown;
    progress: TaskProgress | null;
    metadata: Record<string, unknown> | null;
    // metadata.usage?: { inputTokens: number, outputTokens: number, totalTokens: number }
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

// Parameters for creating a task
export interface CreateTaskParams {
    type: string;
    title: string;
    ledgerId?: string;
    entityId?: string;
    entityType?: string;
    input: unknown;
    metadata?: Record<string, unknown>;
}

// Task handler interface - implement this for each task type
export interface TaskHandler<TOutput = unknown> {
    /**
     * Execute the task. This is the main processing logic.
     * Can use context to checkpoint progress.
     */
    execute: (
        task: GptTask,
        context: TaskExecutionContext
    ) => Promise<TOutput>;

    /**
     * Called after successful execution.
     * Use this to update related business entities.
     */
    onComplete?: (output: TOutput, task: GptTask) => Promise<void>;

    /**
     * Called when task fails (best-effort notification).
     * Note: Recovery is business layer's responsibility.
     */
    onError?: (error: Error, task: GptTask) => Promise<void>;
}

export interface TaskExecutionContext {
    /**
     * Update progress during execution.
     * Progress is persisted and can be used for monitoring/debugging.
     */
    updateProgress: (progress: TaskProgress) => Promise<void>;

    /**
     * Get current saved progress.
     */
    getProgress: () => TaskProgress | null;
}

// Registry types
export type TaskHandlerFactory<TOutput = unknown> = () => TaskHandler<TOutput>;
