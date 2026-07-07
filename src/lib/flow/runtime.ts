import { createAIContext } from "./ai-context";
import { createFlowEngine } from "./engine";
import { registerAllTasks, resetTaskRegistry } from "./task-registry";
import { AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import type { FlowEngine, FlowTaskMetadata } from "./types";

let engine: FlowEngine | null = null;
let initializationPromise: Promise<FlowEngine> | null = null;

async function ensureFlowEngine(): Promise<FlowEngine> {
  if (engine != null) {
    return engine;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    throw new AppError(
      "Flow runtime is not supported in the Edge Runtime.",
      "FLOW_RUNTIME_EDGE_UNSUPPORTED"
    );
  }

  return initializeDefaultFlowRuntime();
}

export async function initializeDefaultFlowRuntime(): Promise<FlowEngine> {
  if (engine != null) {
    return engine;
  }

  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const { getOpenAIClient } = await import("@/lib/ai/openai-client");

    const nextEngine = createFlowEngine({
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

    await registerAllTasks(nextEngine);
    engine = nextEngine;
    return nextEngine;
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

export function getFlowEngine(): FlowEngine {
  if (engine == null) {
    throw new AppError(
      "Flow runtime has not been initialized. Call initializeDefaultFlowRuntime() during startup.",
      "FLOW_RUNTIME_NOT_INITIALIZED"
    );
  }

  return engine;
}

export async function submitFlowTask<TInput>(
  name: string,
  input: TInput,
  meta?: FlowTaskMetadata
): Promise<string> {
  const ensuredEngine = await ensureFlowEngine();
  return ensuredEngine.submit(name, input, meta);
}

export async function cancelFlowTask(taskId: string): Promise<void> {
  const ensuredEngine = await ensureFlowEngine();
  return ensuredEngine.cancel(taskId);
}

export function resetFlowRuntime(): void {
  engine = null;
  initializationPromise = null;
  resetTaskRegistry();
}
