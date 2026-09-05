import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checkerScript = path.join(process.cwd(), "scripts/check-architecture.mjs");

const tempRoots: string[] = [];

function makeFixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "arch-check-"));
  tempRoots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return root;
}

function runChecker(root: string): { status: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [checkerScript], {
      cwd: root,
      encoding: "utf8",
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("check-architecture API transport rules", () => {
  it("rejects API routes importing adapters, persistence, or db", () => {
    // Built dynamically so the checker's own static-import rules do not treat
    // these fixture strings as real imports in this test file.
    const dbSpecifier = "@/lib/db";
    const adapterSpecifier = "@/application/adapters/postgres/api-rate-limit";
    const persistenceSpecifier = "@/persistence";
    const root = makeFixture({
      "src/app/api/v1/example/route.ts": `
import { postgresRateLimiter } from ${JSON.stringify(adapterSpecifier)};
import { db } from ${JSON.stringify(dbSpecifier)};
import { ledgers } from ${JSON.stringify(persistenceSpecifier)};
export async function GET() {
  return new Response("ok");
}
`,
    });

    const result = runChecker(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "src/app/api/v1/example/route.ts: api routes must not import infrastructure adapters or db"
    );
  });

  it("rejects API routes importing module server actions or actions barrels", () => {
    const actionSpecifier = "@/modules/source-document/server-actions/create";
    const barrelSpecifier = "@/modules/ledger/actions";
    const root = makeFixture({
      "src/app/api/v1/example/route.ts": `
import { someAction } from ${JSON.stringify(actionSpecifier)};
import { otherAction } from ${JSON.stringify(barrelSpecifier)};
export async function GET() {
  return new Response("ok");
}
`,
    });

    const result = runChecker(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "src/app/api/v1/example/route.ts: api routes must not import module server actions or actions barrels"
    );
  });

  it("allows API routes importing the server facade, contracts, and composition root", () => {
    const root = makeFixture({
      "src/app/api/v1/example/route.ts": `
import { createSourceDocumentFromCredentialRequest } from "@/modules/source-document/server/create-from-credential-request";
import { apiV1IdempotencyKeySchema } from "@/modules/source-document/contract-schemas";
import { serverComposition } from "@/application/server-composition-root";
export async function GET() {
  return new Response("ok");
}
`,
    });

    const result = runChecker(root);
    expect(result.status).toBe(0);
  });
});

describe("check-architecture inward dependency rules", () => {
  it("rejects modules importing app entrypoints", () => {
    const root = makeFixture({
      "src/modules/ledger/ui/example.ts": 'import x from "@/app/example";',
    });
    expect(runChecker(root)).toMatchObject({ status: 1 });
  });

  it("allows modules importing shared components", () => {
    const root = makeFixture({
      "src/modules/ledger/ui/example.ts": 'import x from "@/components/example";',
    });
    expect(runChecker(root).status).toBe(0);
  });

  it("rejects lib importing modules, app, or application adapters", () => {
    for (const specifier of [
      "@/modules/ledger/contracts",
      "@/app/api/example/route",
      "@/application/adapters/storage",
    ]) {
      const root = makeFixture({
        "src/lib/example.ts": `import x from ${JSON.stringify(specifier)};`,
      });
      expect(runChecker(root).status).toBe(1);
    }
  });

  it("allows lib importing application contracts", () => {
    const root = makeFixture({
      "src/lib/example.ts": 'import type { Port } from "@/application/contracts";',
    });
    expect(runChecker(root).status).toBe(0);
  });

  it("rejects persistence importing domain modules", () => {
    const root = makeFixture({
      "src/persistence/schema/example.ts": 'import x from "@/modules/ledger/contracts";',
    });
    expect(runChecker(root).status).toBe(1);
  });

  it("allows persistence importing shared values", () => {
    const root = makeFixture({
      "src/persistence/schema/example.ts": 'import x from "@/lib/shared-values";',
    });
    expect(runChecker(root).status).toBe(0);
  });

  it("rejects domain modules importing workspace orchestration", () => {
    const root = makeFixture({
      "src/modules/stats/ui/example.ts": 'import x from "@/modules/workspace/example";',
    });
    expect(runChecker(root).status).toBe(1);
  });

  it("allows workspace to orchestrate domain modules", () => {
    const root = makeFixture({
      "src/modules/workspace/example.ts": 'import x from "@/modules/stats/contracts";',
    });
    expect(runChecker(root).status).toBe(0);
  });

  it("detects cycles formed through literal dynamic imports", () => {
    const root = makeFixture({
      "src/lib/a.ts": 'export const load = () => import("./b");',
      "src/lib/b.ts": 'export const load = () => import("./a");',
    });
    const result = runChecker(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain("Architecture cycle:");
  });
});
