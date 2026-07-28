import { describe, expect, it } from "vitest";
import * as authSchema from "@/persistence/schema/auth";

describe("email-only auth schema", () => {
  it("exports only active email auth tables", () => {
    expect(Object.keys(authSchema).sort()).toEqual([
      "emailChangeChallenges",
      "otpTokens",
      "users",
    ]);
  });
});
