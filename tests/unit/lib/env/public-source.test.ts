import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public env source", () => {
  it("uses startup defaults without importing runtime env", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/env/public.ts"), "utf8");

    expect(source).toContain('import { ENV_DEFAULTS } from "./startup"');
    expect(source).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(source).not.toContain("runtimeEnv");
    expect(source).not.toContain("./defaults");
  });

  it("keeps src/lib/constants.ts free of runtimeEnv, startup, and zod imports", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
    expect(source).not.toContain("runtimeEnv");
    expect(source).not.toContain("./env/runtime");
    expect(source).not.toContain("./startup");
    expect(source).not.toContain("zod");
  });
});
