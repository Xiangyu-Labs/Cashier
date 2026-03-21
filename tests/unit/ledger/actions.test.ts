import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ledger actions public surface", () => {
  it("does not re-export access helpers from the client-imported actions entrypoint", () => {
    const source = readFileSync(resolve(process.cwd(), "src/modules/ledger/actions.ts"), "utf8");

    expect(source).not.toContain('from "./access"');
    expect(source).not.toContain("requireLedgerAccess");
    expect(source).not.toContain("withLedgerAccess");
  });
});
