import { describe, expect, it } from "vitest";
import { authenticateServiceCredential } from "@/modules/ledger/application/services/authenticate-service-credential";
import { resolveLedgerForServiceCredential } from "@/modules/ledger/application/services/resolve-ledger-for-service-credential";
import * as credentialAccess from "@/modules/ledger/credential-access";

describe("credential-access barrel", () => {
  it("re-exports service credential access helpers", () => {
    expect(credentialAccess.authenticateServiceCredential).toBe(authenticateServiceCredential);
    expect(credentialAccess.resolveLedgerForServiceCredential).toBe(resolveLedgerForServiceCredential);
  });
});
