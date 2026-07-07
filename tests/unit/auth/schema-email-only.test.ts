import { describe, expect, it } from "vitest";
import * as authSchema from "@/persistence/schema/auth";
import { users } from "@/persistence/schema/auth";

describe("email-only auth schema", () => {
  it("does not expose OAuth accounts or password hash schema", () => {
    expect("accounts" in authSchema).toBe(false);
    expect("passwordHash" in users).toBe(false);
  });
});
