import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

describe("feature server boundary lint", () => {
  it("rejects cross-feature deep imports from server files", async () => {
    const eslint = new ESLint({
      overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
    });

    const [result] = await eslint.lintText(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      {
        // Use a real project-included path so typescript-eslint can build the TS program.
        filePath: "src/features/ledger/server/index.ts",
      }
    );

    expect(result.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("rejects deep feature imports from shared library files", async () => {
    const eslint = new ESLint({
      overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
    });

    const [result] = await eslint.lintText(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      {
        filePath: "src/lib/error-handlers.ts",
      }
    );

    expect(result.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("rejects persistence imports from app files", async () => {
    const eslint = new ESLint({
      overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
    });

    const [result] = await eslint.lintText(
      `
        import { ledgers } from "@/persistence";
        export const leak = ledgers;
      `,
      {
        filePath: "src/app/api/v1/entries/route.ts",
      }
    );

    expect(result.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });
});
