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
        filePath: "src/features/ledger/server/__lint-fixtures__/cross-feature-boundary.ts",
      }
    );

    expect(result.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });
});
