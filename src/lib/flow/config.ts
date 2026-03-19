import type { AIModelConfig } from "./types";

export interface FlowRuntimeEnvConfig {
  maxConcurrentTasks: number;
  aiModelConfig: AIModelConfig;
}

function getRequiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value == null || value.trim() === "") {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
}

function parseNonNegativeInteger(
  rawValue: string | undefined,
  key: string,
  fallback: number
): number {
  const normalizedValue = rawValue == null || rawValue.trim() === "" ? String(fallback) : rawValue;
  const parsed = Number.parseInt(normalizedValue, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return parsed;
}

export function loadFlowRuntimeEnvConfig(
  env: NodeJS.ProcessEnv = process.env
): FlowRuntimeEnvConfig {
  return {
    maxConcurrentTasks: parseNonNegativeInteger(env.MAX_TASK_WORKER, "MAX_TASK_WORKER", 10),
    aiModelConfig: {
      text: getRequiredEnv(env, "AI_MODEL_TEXT"),
      vision: getRequiredEnv(env, "AI_MODEL_VISION"),
    },
  };
}
