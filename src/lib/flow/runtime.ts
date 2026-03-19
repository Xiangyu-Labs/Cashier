import { getOpenAIClient } from "@/lib/ai/openai-client";
import { createAIContext } from "./ai-context";
import { createDrizzleStorage } from "./adapters/drizzle-storage";
import { loadFlowRuntimeEnvConfig } from "./config";
import { createFlowEngine } from "./engine";
import { registerAllTasks, resetTaskRegistry } from "./task-registry";
import type { FlowEngine, FlowRuntime, FlowRuntimeConfig, FlowTaskMetadata } from "./types";

let runtime: FlowRuntime | null = null;
let initializationPromise: Promise<FlowRuntime> | null = null;

export function createFlowRuntime(config: FlowRuntimeConfig): FlowRuntime {
  const engine = createFlowEngine({
    storage: config.storage,
    maxConcurrentTasks: config.maxConcurrentTasks,
    aiContextFactory: (signal, reportTokens) =>
      createAIContext({
        signal,
        reportTokens,
        getClient: config.ai.getClient,
        modelConfig: config.ai.models,
      }),
  });

  return {
    engine,
    ai: config.ai,
  };
}

export async function initializeFlowRuntime(config: FlowRuntimeConfig): Promise<FlowRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const nextRuntime = createFlowRuntime(config);
    await registerAllTasks(nextRuntime.engine);
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

export async function initializeDefaultFlowRuntime(): Promise<FlowRuntime> {
  const envConfig = loadFlowRuntimeEnvConfig();

  return initializeFlowRuntime({
    storage: createDrizzleStorage(),
    maxConcurrentTasks: envConfig.maxConcurrentTasks,
    ai: {
      getClient: getOpenAIClient,
      models: envConfig.aiModelConfig,
    },
  });
}

export function getFlowRuntime(): FlowRuntime {
  if (runtime == null) {
    throw new Error(
      "Flow runtime has not been initialized. Call initializeDefaultFlowRuntime() during startup."
    );
  }

  return runtime;
}

export function getFlowEngine(): FlowEngine {
  return getFlowRuntime().engine;
}

export async function submitFlowTask<TInput>(
  name: string,
  input: TInput,
  meta?: FlowTaskMetadata
): Promise<string> {
  return getFlowEngine().submit(name, input, meta);
}

export async function cancelFlowTask(taskId: string): Promise<void> {
  return getFlowEngine().cancel(taskId);
}

export function resetFlowRuntime(): void {
  runtime = null;
  initializationPromise = null;
  resetTaskRegistry();
}
