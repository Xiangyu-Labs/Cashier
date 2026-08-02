import { describe, expect, it } from "vitest";
import { logIdentifier } from "@/lib/security/log-identifier";

describe("logIdentifier", () => {
  it("is stable and does not expose the original value", () => {
    const first = logIdentifier("email", "User@Example.com");
    const second = logIdentifier("email", " user@example.com ");

    expect(first).toBe(second);
    expect(first).toMatch(/^email:[a-f0-9]{16}$/);
    expect(first).not.toContain("example.com");
  });
});
