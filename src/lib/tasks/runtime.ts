import { createAIContext } from "./ai-context";
import { createTaskRuntime } from "./engine";
import { registerAllTasks, resetTaskRegistry } from "./task-registry";
import { AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import type { TaskRuntime, TaskMetadata } from "./types";

let runtime: TaskRuntime | null = null;
let initializationPromise: Promise<TaskRuntime> | null = null;

async function ensureTaskRuntime(): Promise<TaskRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    throw new AppError(
      "Task runtime is not supported in the Edge Runtime.",
      "TASK_RUNTIME_EDGE_UNSUPPORTED"
    );
  }

  return initializeDefaultTaskRuntime();
}

export async function initializeDefaultTaskRuntime(): Promise<TaskRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const { getOpenAIClient } = await import("@/lib/ai/openai-client");

    const nextRuntime = createTaskRuntime({
      maxConcurrentTasks: runtimeEnv.maxTaskWorker,
      aiContextFactory: (signal, reportTokens) =>
        createAIContext({
          signal,
          reportTokens,
          getClient: getOpenAIClient,
          modelConfig: {
            text: runtimeEnv.aiModelText,
            vision: runtimeEnv.aiModelVision,
          },
        }),
    });

    await registerAllTasks(nextRuntime);
    runtime = nextRuntime;
    return nextRuntime;
  })();

  try {
    return await initializationPromise;
  } catch (error) {
    resetTaskRegistry();
    throw error;
  } finally {
    initializationPromise = null;
  }
}

export function getTaskRuntime(): TaskRuntime {
  if (runtime == null) {
    throw new AppError(
      "Task runtime has not been initialized. Call initializeDefaultTaskRuntime() during startup.",
      "TASK_RUNTIME_NOT_INITIALIZED"
    );
  }

  return runtime;
}

export async function submitTask<TInput>(
  name: string,
  input: TInput,
  meta?: TaskMetadata
): Promise<string> {
  const ensuredRuntime = await ensureTaskRuntime();
  return ensuredRuntime.submit(name, input, meta);
}

export async function cancelTask(taskId: string): Promise<void> {
  const ensuredRuntime = await ensureTaskRuntime();
  return ensuredRuntime.cancel(taskId);
}

export function resetTaskRuntime(): void {
  runtime = null;
  initializationPromise = null;
  resetTaskRegistry();
}
