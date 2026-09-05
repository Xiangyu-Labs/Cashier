import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runVitest, signalExitCode } from "../../../scripts/run-vitest.mjs";

describe("Vitest runner", () => {
  it("forwards arguments, isolates startup configuration, and returns the child status", async () => {
    const child = Object.assign(new EventEmitter(), { killed: false, kill: vi.fn() });
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 7, null));
      return child;
    });

    await expect(
      runVitest({
        args: ["run", "tests/unit/example.test.ts", "--reporter=dot"],
        environment: {
          NODE_ENV: "development",
          OPENAI_API_KEY: "real-secret",
          PATH: "/bin",
        } as NodeJS.ProcessEnv,
        spawnProcess: spawnProcess as never,
      })
    ).resolves.toBe(7);

    const [, args, options] = (spawnProcess.mock.calls[0] ?? []) as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(args).toEqual([
      expect.stringContaining("node_modules/vitest/vitest.mjs"),
      "run",
      "tests/unit/example.test.ts",
      "--reporter=dot",
    ]);
    expect(options.env).toMatchObject({
      OPENAI_API_KEY: "test-openai-key",
      NODE_ENV: "test",
      PATH: "/bin",
    });
  });

  it("maps termination signals to conventional exit codes", () => {
    expect(signalExitCode("SIGINT")).toBe(130);
    expect(signalExitCode("SIGTERM")).toBe(143);
    expect(signalExitCode("SIGHUP")).toBe(1);
  });
});
