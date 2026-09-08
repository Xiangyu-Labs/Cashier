import { describe, expect, it } from "vitest";
import { createAfterCallbackTracker } from "tests/helpers/after-callbacks";

describe("after() callback tracking", () => {
  it("starts immediately and drains nested callbacks", async () => {
    const tracker = createAfterCallbackTracker();
    const calls: string[] = [];
    tracker.register(async () => {
      calls.push("start");
      await Promise.resolve();
      tracker.register(async () => {
        calls.push("nested");
      });
    });
    expect(calls).toEqual(["start"]);
    await tracker.flush();
    expect(calls).toEqual(["start", "nested"]);
  });

  it("surfaces synchronous and asynchronous failures even after they settle", async () => {
    const tracker = createAfterCallbackTracker();
    const sync = new Error("sync");
    const asyncError = new Error("async");
    tracker.register(() => {
      throw sync;
    });
    tracker.register(async () => {
      throw asyncError;
    });
    await Promise.resolve();
    await expect(tracker.flush()).rejects.toMatchObject({ errors: [sync, asyncError] });
    await expect(tracker.flush()).resolves.toBeUndefined();
  });

  it("retains timed-out work until a later flush actually drains it", async () => {
    const tracker = createAfterCallbackTracker();
    let release!: () => void;
    tracker.register(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    try {
      await expect(tracker.flush(5)).rejects.toThrow("did not settle");
      await expect(tracker.flush(5)).rejects.toThrow("did not settle");
    } finally {
      release();
      await tracker.flush();
    }
  });
});
