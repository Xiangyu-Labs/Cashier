import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Flow Engine - A lightweight async task manager for AI workloads
 *
 * The engine only manages task lifecycle, not internal implementation details.
 * Tasks are responsible for their own multi-stage logic, model selection, etc.
 */

// ===== Engine Layer Interfaces =====

/**
 * Storage adapter interface (injected by the consumer)
 */
export interface StorageAdapter {
  create(task: TaskInput): Promise<string>;
  update(id: string, data: Partial<TaskRecord>): Promise<void>;
  get(id: string): Promise<TaskRecord | null>;
  list(filter?: TaskFilter): Promise<TaskRecord[]>;
}

/**
 * Input for creating a new task
 */
export interface TaskInput {
  type: string;
  title?: string | null;
  input?: unknown;
  scopeId?: string | null; // Scope ID (e.g., ledgerId in Cashier)
  entityType?: string | null; // Entity type (e.g., "source_document", "category")
  entityId?: string | null; // Entity ID (e.g., sourceDocumentId, categoryId)
  deduplicationKey?: string | null; // Key for preventing duplicate tasks
}

/**
 * Query filter for listing tasks
 */
export interface TaskFilter {
  type?: string; // Filter by task type
  status?: TaskStatus; // Filter by status
  limit?: number; // Result count limit
  offset?: number; // Pagination offset
}

/**
 * Task record stored in database
 */
export interface TaskRecord {
  id: string;
  type: string; // Task type, e.g., 'parse-document'
  title: string | null; // Task title (optional)
  status: TaskStatus; // pending / running / completed / failed / cancelled
  progress: string | null; // "Processing image..."
  input: unknown | null; // Complete task input (framework-enforced)
  deduplicationKey: string | null; // Explicit key for preventing duplicate tasks
  error: string | null; // Error message on failure
  tokenUsage: TokenUsageRecord | null; // Token statistics by model
  scopeId: string | null; // Scope ID (e.g., ledgerId)
  entityType: string | null; // Entity type (e.g., "source_document")
  entityId: string | null; // Entity ID (e.g., sourceDocumentId)
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null; // When task transitioned to running
  completedAt: Date | null; // When task reached terminal state
}

/**
 * Task status enum
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Token usage record with per-model breakdown
 */
export interface TokenUsageRecord {
  [model: string]: { input: number; output: number };
  // 'total' key is computed and added by the engine
}

/**
 * Engine configuration
 */
export interface FlowEngineConfig {
  storage: StorageAdapter;
  /**
   * Maximum number of concurrent tasks.
   * If not set, defaults to 10.
   * Set to 0 or Infinity for unlimited concurrent tasks.
   */
  maxConcurrentTasks?: number;
  aiContextFactory?: AIContextFactory;
}

// ===== Task Layer Interfaces =====

/**
 * Execution context passed to task handlers
 */
export interface FlowContext {
  taskId: string;
  /** @internal Cancellation signal - prefer using context.ai which handles this automatically */
  signal: AbortSignal;
  /** @internal Report token usage - prefer using context.ai which handles this automatically */
  reportTokens(usage: TokenUsage): void;
  updateProgress(message: string): Promise<void>;

  // AI capabilities
  ai: AIContext;
}

/**
 * Token usage reported by tasks
 */
export interface TokenUsage {
  model: string; // Model name, e.g., 'gpt-4o', 'gemini-2.5-flash'
  input: number; // Input token count
  output: number; // Output token count
}

/**
 * Task handler interface
 *
 * The engine doesn't care about internal implementation.
 * Tasks manage their own multi-stage logic, model selection, arbitration, etc.
 */
export interface FlowTaskHandler<TInput, TOutput> {
  /**
   * Main execution logic (required)
   */
  execute(input: TInput, context: FlowContext): Promise<TOutput>;

  /**
   * Called on completion (optional)
   * Use for side effects like updating related records
   */
  onComplete?(output: TOutput, input: TInput, context: FlowContext): Promise<void>;

  /**
   * Called on error (optional)
   * Use for cleanup and error logging
   */
  onError?(error: Error, input: TInput, context: FlowContext): Promise<void>;

  /**
   * Called on cancellation (optional)
   * Use for cleanup when task is cancelled
   */
  onCancel?(input: TInput, context: FlowContext): Promise<void>;
}

/**
 * Explicit task definition used by the centralized task registry.
 * Task modules export this structure; only the registry performs registration.
 */
export interface FlowTaskDefinition<TInput, TOutput> {
  type: string;
  handler: FlowTaskHandler<TInput, TOutput>;
}

/**
 * Flow engine instance type
 */
export interface FlowEngine {
  /**
   * Register a task handler
   */
  register<TInput, TOutput>(name: string, handler: FlowTaskHandler<TInput, TOutput>): void;

  /**
   * Submit a task for background execution
   * Returns taskId immediately, task runs in background
   */
  submit<TInput>(name: string, input: TInput, meta?: FlowTaskMetadata): Promise<string>;

  /**
   * Cancel a running task
   */
  cancel(taskId: string): Promise<void>;

  /**
   * Get task status by ID
   */
  getStatus(taskId: string): Promise<TaskRecord | null>;

  /**
   * List tasks with optional filter
   */
  listTasks(filter?: TaskFilter): Promise<TaskRecord[]>;

  /**
   * Get all currently running tasks
   */
  getRunningTasks(): Promise<TaskRecord[]>;

  /**
   * Get task engine metrics including queue depth and dead tasks
   */
  getMetrics(): Promise<TaskMetrics>;
}

/**
 * Task metrics for monitoring the flow engine
 */
export interface TaskMetrics {
  executionTime: number;
  queueDepth: number;
  deadTasks: string[];
}

export interface FlowTaskMetadata {
  title?: string;
  scopeId?: string;
  entityType?: string;
  entityId?: string;
  deduplicationKey?: string;
}

// ===== AI Integration Types =====

/**
 * AI model tier - business code selects tier, flow engine resolves to concrete model
 * - text: text-only, used for all business logic (parsing, arbitration, categorization)
 * - vision: multimodal (vision+text), used only for Stage 0 image description
 */
export type AIModelTier = "text" | "vision";

export interface AIModelConfig {
  text: string;
  vision: string;
}

/**
 * Options for AI generation
 */
export interface AIGenerateOptions {
  prompt: string; // System prompt
  messages: AIMessage[]; // User messages (can include images)
  model: AIModelTier; // Required: 'text' or 'vision' tier
  maxTokens?: number; // Max output tokens, defaults to 8192
  temperature?: number; // Creativity (0-2), defaults to 1
  requireJson?: boolean; // Require valid JSON response, defaults to false
  autoReportTokens?: boolean; // Auto-report tokens, defaults to true
}

/**
 * AI message content part
 */
export type AIMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * AI message
 */
export interface AIMessage {
  role: "user" | "assistant";
  content: string | AIMessageContentPart[];
}

/**
 * AI generation response
 */
export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * AI context interface
 */
export interface AIContext {
  generate(options: AIGenerateOptions): Promise<AIResponse>;
}

export interface AIClient {
  generateContent(
    systemPrompt: string,
    messages: ChatCompletionMessageParam[],
    model: string,
    maxTokens?: number,
    temperature?: number,
    responseFormat?:
      | { type: "text" }
      | { type: "json_object" }
      | {
          type: "json_schema";
          json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
        },
    signal?: AbortSignal
  ): Promise<AIResponse>;
}

export type AIClientFactory = () => AIClient;

export type AIContextFactory = (
  signal: AbortSignal,
  reportTokens: (usage: TokenUsage) => void
) => AIContext;

export interface FlowRuntimeConfig {
  storage: StorageAdapter;
  maxConcurrentTasks?: number;
  ai: {
    getClient: AIClientFactory;
    models: AIModelConfig;
  };
}

export interface FlowRuntime {
  engine: FlowEngine;
  ai: FlowRuntimeConfig["ai"];
}
