import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runCheckBuild } from "../../../scripts/run-check-build.mjs";

describe("check build runner", () => {
  it("runs the ordinary build with production placeholders", async () => {
    const child = new EventEmitter();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    await expect(
      runCheckBuild({
        environment: {
          NODE_ENV: "development",
          AUTH_SECRET: "real-secret",
          PATH: "/bin",
        } as NodeJS.ProcessEnv,
        spawnProcess: spawnProcess as never,
      })
    ).resolves.toBe(0);

    const [, args, options] = (spawnProcess.mock.calls[0] ?? []) as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(args).toEqual(["run", "build"]);
    expect(options.env).toMatchObject({
      AUTH_SECRET: "test-auth-secret",
      NODE_ENV: "production",
      PATH: "/bin",
    });
  });
});
