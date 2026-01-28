// Processing Task Types - General purpose task infrastructure
// Best-effort execution: processing infra runs tasks and records results
// Business layer is responsible for recovery/retry decisions

export type ProcessingTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

// Progress tracking structure (stored in JSONB)
export interface ProcessingTaskProgress {
    currentStep?: string;
    completedSteps?: string[];
    totalSteps?: number;
    data?: unknown;
}

// Core task interface (maps to processing_tasks table)
export interface ProcessingTask {
    id: string;
    type: string;              // Flexible task type
    title: string;
    ledgerId: string | null;
    entityId: string | null;   // Generic entity reference
    entityType: string | null; // Type of entity (e.g., "source_document", "ledger_entry")
    status: ProcessingTaskStatus;
    error: string | null;
    input: unknown;
    output: unknown;
    progress: ProcessingTaskProgress | null;
    metadata: Record<string, unknown> | null;
    // metadata.usage?: { inputTokens: number, outputTokens: number, totalTokens: number }
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

// Parameters for creating a task
export interface CreateProcessingTaskParams {
    type: string;
    title: string;
    ledgerId?: string;
    entityId?: string;
    entityType?: string;
    input: unknown;
    metadata?: Record<string, unknown>;
}

// Task handler interface - implement this for each task type
export interface ProcessingTaskHandler<TOutput = unknown> {
    /**
     * Execute the task. This is the main processing logic.
     * Can use context to checkpoint progress.
     */
    execute: (
        task: ProcessingTask,
        context: ProcessingTaskExecutionContext
    ) => Promise<TOutput>;

    /**
     * Called after successful execution.
     * Use this to update related business entities.
     */
    onComplete?: (output: TOutput, task: ProcessingTask) => Promise<void>;

    /**
     * Called when task fails (best-effort notification).
     * Note: Recovery is business layer's responsibility.
     */
    onError?: (error: Error, task: ProcessingTask) => Promise<void>;
}

export interface ProcessingTaskExecutionContext {
    /**
     * Update progress during execution.
     * Progress is persisted and can be used for monitoring/debugging.
     */
    updateProgress: (progress: ProcessingTaskProgress) => Promise<void>;

    /**
     * Get current saved progress.
     */
    getProgress: () => ProcessingTaskProgress | null;
}

// Registry types
export type ProcessingTaskHandlerFactory<TOutput = unknown> = () => ProcessingTaskHandler<TOutput>;
