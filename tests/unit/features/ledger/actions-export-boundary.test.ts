import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ledger action export boundaries", () => {
  it("does not re-export raw queries from the client-importable actions entrypoint", () => {
    const actionsModulePath = path.join(process.cwd(), "src/modules/ledger/actions.ts");
    const source = readFileSync(actionsModulePath, "utf8");

    expect(source).not.toMatch(/from ['"]\.\/queries['"]/);
  });

  it("does not re-export service credential validation from the client-importable actions entrypoint", () => {
    const actionsModulePath = path.join(process.cwd(), "src/modules/ledger/actions.ts");
    const source = readFileSync(actionsModulePath, "utf8");

    expect(source).not.toMatch(/validateServiceCredential/);
  });
});
