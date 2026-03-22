import { describe, expect, it } from "vitest";
import { loadFlowRuntimeEnvConfig } from "@/lib/flow/config";

describe("loadFlowRuntimeEnvConfig", () => {
  it("parses explicit flow runtime configuration from env", () => {
    const config = loadFlowRuntimeEnvConfig({
      MAX_TASK_WORKER: "7",
      AI_MODEL_TEXT: "gpt-text",
      AI_MODEL_VISION: "gpt-vision",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      maxConcurrentTasks: 7,
      aiModelConfig: {
        text: "gpt-text",
        vision: "gpt-vision",
      },
    });
  });

  it("defaults MAX_TASK_WORKER to 10 when unset", () => {
    const config = loadFlowRuntimeEnvConfig({
      AI_MODEL_TEXT: "gpt-text",
      AI_MODEL_VISION: "gpt-vision",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(config.maxConcurrentTasks).toBe(10);
  });

  it("defaults AI model config when values are unset", () => {
    const config = loadFlowRuntimeEnvConfig({
      MAX_TASK_WORKER: "3",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(config.aiModelConfig).toEqual({
      text: "gpt-4o-mini",
      vision: "gpt-4o",
    });
  });

  it("throws when MAX_TASK_WORKER is invalid", () => {
    expect(() =>
      loadFlowRuntimeEnvConfig({
        MAX_TASK_WORKER: "-1",
        AI_MODEL_TEXT: "gpt-text",
        AI_MODEL_VISION: "gpt-vision",
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv)
    ).toThrow("MAX_TASK_WORKER must be a non-negative integer");
  });
});
