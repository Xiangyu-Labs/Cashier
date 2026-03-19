import { createAIContext } from "./ai-context";
import { loadFlowRuntimeEnvConfig } from "./config";
import { createFlowEngine } from "./engine";
import { registerAllTasks, resetTaskRegistry } from "./task-registry";
import type { FlowEngine, FlowRuntime, FlowRuntimeConfig, FlowTaskMetadata } from "./types";

let runtime: FlowRuntime | null = null;
let initializationPromise: Promise<FlowRuntime> | null = null;

async function ensureFlowRuntime(): Promise<FlowRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error("Flow runtime is not supported in the Edge Runtime.");
  }

  return initializeDefaultFlowRuntime();
}

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
  const [{ createDrizzleStorage }, { getOpenAIClient }] = await Promise.all([
    import("./adapters/drizzle-storage"),
    import("@/lib/ai/openai-client"),
  ]);
  const client = getOpenAIClient();

  return initializeFlowRuntime({
    storage: createDrizzleStorage(),
    maxConcurrentTasks: envConfig.maxConcurrentTasks,
    ai: {
      getClient: () => client,
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
  const ensuredRuntime = await ensureFlowRuntime();
  return ensuredRuntime.engine.submit(name, input, meta);
}

export async function cancelFlowTask(taskId: string): Promise<void> {
  const ensuredRuntime = await ensureFlowRuntime();
  return ensuredRuntime.engine.cancel(taskId);
}

export function resetFlowRuntime(): void {
  runtime = null;
  initializationPromise = null;
  resetTaskRegistry();
}
