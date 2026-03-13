import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoRegisterTasks } from "@/lib/flow/task-registry";

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/lib/flow", () => ({
    flowEngine: {
        register: vi.fn(),
    },
}));

describe("task-registry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("autoRegisterTasks should not throw", async () => {
        // This test verifies the function runs without errors
        // In a real test environment, it will scan the test directory
        await expect(autoRegisterTasks()).resolves.not.toThrow();
    });
});
