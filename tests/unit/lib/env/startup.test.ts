import { describe, expect, it } from "vitest";
import { validateStartupEnv } from "@/lib/env/startup";

const baseEnv = {
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_API_KEY: "sk-test",
  AUTH_SECRET: "auth-secret",
  AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} as NodeJS.ProcessEnv;

describe("validateStartupEnv", () => {
  it("reports missing required startup env vars together", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        OPENAI_API_KEY: "",
        AUTH_SECRET: "",
      })
    ).toThrow(/OPENAI_API_KEY|AUTH_SECRET/);
  });

  it("rejects invalid numeric values and partial OIDC config", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        AI_MAX_RETRIES: "-1",
        OIDC_ISSUER: "https://sso.cashier.test",
      })
    ).toThrow(/AI_MAX_RETRIES|OIDC_CLIENT_ID|OIDC_CLIENT_SECRET/);
  });

  it("applies defaults for optional startup-validated env vars", () => {
    const result = validateStartupEnv(baseEnv);

    expect(result.AI_MODEL_TEXT).toBe("gpt-4o-mini");
    expect(result.AI_MODEL_VISION).toBe("gpt-4o");
    expect(result.AI_MAX_RETRIES).toBe(3);
    expect(result.AI_RETRY_DELAY_MS).toBe(1000);
    expect(result.NEXT_PUBLIC_OIDC_ENABLED).toBe("false");
  });
});
