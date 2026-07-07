import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public env browser compatibility", () => {
  it("uses shared documented defaults while keeping direct NEXT_PUBLIC reads", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/env/public.ts"), "utf8");

    expect(source).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_OIDC_ENABLED");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME");
    expect(source).toContain("ENV_DEFAULTS.NEXT_PUBLIC_APP_URL");
    expect(source).not.toContain('from "./startup"');
    expect(source).not.toContain('from "@/lib/env/startup"');
  });

  it("uses direct NEXT_PUBLIC env access so Next.js can inline browser values", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/env/public.ts"), "utf8");

    expect(source).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_OIDC_ENABLED");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME");
    expect(source).not.toContain('getEnvValue(process.env, name)');
    expect(source).not.toContain('readPublicValue("NEXT_PUBLIC_OIDC_ENABLED")');
    expect(source).not.toContain('readPublicValue("NEXT_PUBLIC_OIDC_BUTTON_NAME")');
  });
});
