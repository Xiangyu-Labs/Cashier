import { Job } from 'bullmq';

/**
 * Core interface for task handlers.
 * Supports both direct results and recursive flow definitions.
 */
export interface FlowTaskHandler<TInput, TOutput> {
    /** Pre-execution validation (optional) */
    validate?(input: TInput, context: FlowContext): Promise<void>;

    /** Main execution - returns result OR new FlowDefinition for recursion */
    execute(input: TInput, context: FlowContext): Promise<TOutput | FlowDefinition>;

    /** Called when all children complete (for parent tasks) */
    onChildrenCompleted?(results: unknown[], context: FlowContext): Promise<TOutput>;

    /** Final step - only Root task runs this. MUST be idempotent. */
    onComplete?(output: TOutput, input: TInput, context: FlowContext): Promise<void>;

    /** Called on final failure (after retries exhausted) */
    onError?(error: Error, input: TInput, context: FlowContext): Promise<void>;

    /** Called when task is cancelled */
    onCancel?(input: TInput, context: FlowContext): Promise<void>;
}

export interface FlowDefinition {
    name: string;         // System Name - determines handler
    title: string;        // Display Title - for UI (REQUIRED)
    queueName: 'main' | 'api'; // Queue assignment
    data: unknown;        // Task input data
    children?: FlowDefinition[];
    opts?: FlowJobOptions;
}

export interface FlowJobOptions {
    priority?: number;
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
}

export interface FlowContext {
    jobId: string;
    taskRunId?: string;      // DB task_runs.id for Root task
    ledgerId?: string;
    updateProgress: (progress: FlowProgress) => Promise<void>;
    isCancelled: () => Promise<boolean>;
}

export interface FlowProgress {
    currentStep?: string;
    completedSteps?: string[];
    totalSteps?: number;
    data?: unknown;
}
