import { describe, expect, it } from "vitest";
import { findBoundaryViolations } from "../../../scripts/architecture-rules.mjs";

describe("findBoundaryViolations", () => {
  it("allows legal imports across the shared layers", () => {
    expect(
      findBoundaryViolations(
        "src/lib/date-utils.ts",
        'import { format } from "date-fns";\nimport { queryKeys } from "@/lib/query-keys";'
      )
    ).toEqual([]);
    expect(
      findBoundaryViolations(
        "src/lib/tasks/ai-context.ts",
        'import type { SourceDocumentContract } from "@/application/contracts";'
      )
    ).toEqual([]);
    expect(
      findBoundaryViolations(
        "src/components/providers/theme-provider.tsx",
        '"use client";\nimport { createContext } from "react";'
      )
    ).toEqual([]);
    expect(
      findBoundaryViolations(
        "src/modules/ledger/application/use-cases/list-entries.ts",
        'import type { LedgerEntryPort } from "@/application/contracts";'
      )
    ).toEqual([]);
    expect(
      findBoundaryViolations(
        "src/application/contracts/index.ts",
        'import type { Something } from "@/modules/ledger/contracts";'
      )
    ).toEqual([]);
  });

  it("rejects src/lib importing the server composition root", () => {
    const violations = findBoundaryViolations(
      "src/lib/request-cache.ts",
      'import { serverComposition } from "@/application/server-composition-root";'
    );
    expect(violations).toEqual([
      "src/lib/request-cache.ts: src/lib must not import the server composition root",
    ]);
  });

  it.each([
    ["use-cases", "@/modules/ledger/application/use-cases/list-entries"],
    ["hooks", "@/modules/ledger/hooks/useCategoryMutations"],
    ["ui", "@/modules/ledger/ui/LedgerEntryDetailModal"],
    ["server actions", "@/modules/currency/server-actions/convert-currency"],
  ])("rejects src/lib importing module %s", (_label, specifier) => {
    const violations = findBoundaryViolations(
      "src/lib/orchestration/worker.ts",
      `import { thing } from "${specifier}";`
    );
    expect(violations).toEqual([
      "src/lib/orchestration/worker.ts: src/lib must not import modules, app, or application adapters",
    ]);
  });

  it("rejects src/components/providers importing module UI", () => {
    const violations = findBoundaryViolations(
      "src/components/providers/ModalStackRenderer.tsx",
      'import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";'
    );
    expect(violations).toEqual([
      "src/components/providers/ModalStackRenderer.tsx: src/components/providers must not import module UI",
    ]);
  });

  it.each([
    ["persistence", "@/persistence"],
    ["database", "@/lib/db"],
    ["application adapters", "@/application/adapters/postgres/business-ports"],
    ["provider SDK", "openai"],
    ["provider SDK", "pg"],
    ["provider SDK", "drizzle-orm"],
    ["provider SDK", "@aws-sdk/client-s3"],
  ])("rejects contracts importing %s", (_label, specifier) => {
    const violations = findBoundaryViolations(
      "src/application/contracts/index.ts",
      `import { thing } from "${specifier}";`
    );
    expect(violations).toEqual([
      "src/application/contracts/index.ts: application contracts must not import persistence, database, provider SDKs, or application adapters",
    ]);
  });

  it.each([
    ["database", "@/lib/db"],
    ["persistence", "@/persistence"],
    ["composition root", "@/application/server-composition-root"],
    ["s3", "@/lib/storage/s3"],
    ["openai client", "@/lib/ai/openai-client"],
  ])("rejects client components importing %s", (_label, specifier) => {
    const violations = findBoundaryViolations(
      "src/modules/workspace/ui/LedgerPageClient.tsx",
      `"use client";\nimport { thing } from "${specifier}";`
    );
    expect(violations).toEqual([
      "src/modules/workspace/ui/LedgerPageClient.tsx: client components must not import server-only infrastructure",
    ]);
  });

  it("detects the client directive after leading comments", () => {
    expect(
      findBoundaryViolations(
        "src/modules/workspace/ui/LedgerPageClient.tsx",
        '// Renders the active ledger.\n/* eslint-disable */\n"use client";\nimport { db } from "@/lib/db";'
      )
    ).toEqual([
      "src/modules/workspace/ui/LedgerPageClient.tsx: client components must not import server-only infrastructure",
    ]);
    expect(
      findBoundaryViolations(
        "src/modules/workspace/ui/LedgerPageClient.tsx",
        '/* Header comment. */\n"use client"\nimport { db } from "@/lib/db";'
      )
    ).toEqual([
      "src/modules/workspace/ui/LedgerPageClient.tsx: client components must not import server-only infrastructure",
    ]);
  });

  it("keeps flagging import type from banned paths but allows contract types", () => {
    expect(
      findBoundaryViolations(
        "src/lib/worker.ts",
        'import type { ServerOnlyThing } from "@/application/server-composition-root";'
      )
    ).toEqual(["src/lib/worker.ts: src/lib must not import the server composition root"]);
    expect(
      findBoundaryViolations(
        "src/modules/workspace/ui/ClientView.tsx",
        '"use client";\nimport type { DbRow } from "@/persistence";'
      )
    ).toEqual([
      "src/modules/workspace/ui/ClientView.tsx: client components must not import server-only infrastructure",
    ]);
    expect(
      findBoundaryViolations(
        "src/modules/workspace/ui/ClientView.tsx",
        '"use client";\nimport type { LedgerDto } from "@/modules/ledger/contracts";'
      )
    ).toEqual([]);
  });

  it.each(["@/modules/ledger/actions", "./actions", "../actions", "../../actions"])(
    "rejects client imports from module actions barrel %s",
    (specifier) => {
      expect(
        findBoundaryViolations(
          "src/modules/ledger/hooks/useLedger.ts",
          `"use client";\nimport { getLedgerAction } from "${specifier}";`
        )
      ).toEqual([
        "src/modules/ledger/hooks/useLedger.ts: client components must import concrete server actions, not module actions barrels",
      ]);
    }
  );

  it("rejects raw business identifiers in logger and console object arguments", () => {
    expect(
      findBoundaryViolations(
        "src/modules/source-document/server-actions/process.ts",
        'logger.error({ error, ledgerId, sourceDocumentId }, "failed");\nconsole.error("failed", { revisionId });'
      )
    ).toEqual([
      "src/modules/source-document/server-actions/process.ts: logger/console must hash or omit raw identifier property ledgerId",
      "src/modules/source-document/server-actions/process.ts: logger/console must hash or omit raw identifier property sourceDocumentId",
      "src/modules/source-document/server-actions/process.ts: logger/console must hash or omit raw identifier property revisionId",
    ]);
  });

  it("allows hashed subjects and correlation identifiers in logs", () => {
    expect(
      findBoundaryViolations(
        "src/modules/source-document/server-actions/process.ts",
        'import { logIdentifier } from "@/lib/security/log-identifier";\nlogger.error({ ledgerId: logIdentifier("ledger", ledgerId), sourceDocumentSubject, requestId, correlationId }, "failed");'
      )
    ).toEqual([]);
  });

  it("ignores identifier names in comments and ordinary strings", () => {
    expect(
      findBoundaryViolations(
        "src/modules/source-document/server-actions/process.ts",
        '// activeRevisionId and ledgerId are domain terms.\nconst message = "sourceDocumentId";'
      )
    ).toEqual([]);
  });

  it.each(["@/lib/db", "@/persistence", "@/application/adapters/postgres/revisions"])(
    "rejects in-process adapters importing concrete runtime dependency %s",
    (specifier) => {
      expect(
        findBoundaryViolations(
          "src/application/adapters/in-process/processor.ts",
          `import { dependency } from "${specifier}";`
        )
      ).toEqual([
        "src/application/adapters/in-process/processor.ts: in-process adapters must receive persistence and concrete adapters explicitly",
      ]);
    }
  );

  it("catches dynamic imports and re-exports", () => {
    expect(
      findBoundaryViolations(
        "src/lib/lazy.ts",
        'export const load = () => import("@/application/server-composition-root");'
      )
    ).toEqual(["src/lib/lazy.ts: src/lib must not import the server composition root"]);
    expect(
      findBoundaryViolations(
        "src/components/providers/Barrel.tsx",
        'export { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";'
      )
    ).toEqual([
      "src/components/providers/Barrel.tsx: src/components/providers must not import module UI",
    ]);
    expect(
      findBoundaryViolations(
        "src/lib/lazy-client.ts",
        '"use client";\nconst load = () => import("@/lib/storage/s3");'
      )
    ).toEqual([
      "src/lib/lazy-client.ts: client components must not import server-only infrastructure",
    ]);
  });

  it("normalizes relative imports before applying boundaries", () => {
    expect(
      findBoundaryViolations(
        "src/lib/lazy.ts",
        'export const load = () => import("../modules/ledger/contracts");'
      )
    ).toEqual(["src/lib/lazy.ts: src/lib must not import modules, app, or application adapters"]);
  });

  it("allows in-process adapters to import sibling helpers", () => {
    expect(
      findBoundaryViolations(
        "src/application/adapters/in-process/processor.ts",
        'import { load } from "./stored-image-loader";'
      )
    ).toEqual([]);
  });

  it("catches namespace re-exports from banned paths", () => {
    expect(
      findBoundaryViolations(
        "src/application/contracts/index.ts",
        'export * as db from "@/persistence";'
      )
    ).toEqual([
      "src/application/contracts/index.ts: application contracts must not import persistence, database, provider SDKs, or application adapters",
    ]);
    expect(
      findBoundaryViolations(
        "src/application/contracts/index.ts",
        'export type * as sdk from "openai";'
      )
    ).toEqual([
      "src/application/contracts/index.ts: application contracts must not import persistence, database, provider SDKs, or application adapters",
    ]);
    expect(
      findBoundaryViolations(
        "src/application/contracts/index.ts",
        'export * as utils from "./utils";'
      )
    ).toEqual([]);
  });

  it("keeps the existing module application and server action rules", () => {
    expect(
      findBoundaryViolations(
        "src/modules/ledger/application/use-cases/update-ledger.ts",
        'import { serverComposition } from "@/application/server-composition-root";'
      )
    ).toEqual([
      "src/modules/ledger/application/use-cases/update-ledger.ts: application code must receive ports explicitly",
    ]);
    expect(
      findBoundaryViolations(
        "src/modules/ledger/server-actions/entries.ts",
        'import { db } from "@/lib/db";'
      )
    ).toEqual([
      "src/modules/ledger/server-actions/entries.ts: server actions must call application ports/use cases",
    ]);
  });

  it("restricts source-document writes to registered aggregate writers", () => {
    expect(
      findBoundaryViolations(
        "src/application/adapters/postgres/unregistered-writer.ts",
        "await tx.update(sourceDocuments).set({ title });"
      )
    ).toEqual([
      "src/application/adapters/postgres/unregistered-writer.ts: sourceDocuments writes must use the registered aggregate gateway",
    ]);
    expect(
      findBoundaryViolations(
        "src/application/adapters/postgres/source-document-updates.ts",
        "await tx.update(sourceDocuments).set({ title });"
      )
    ).toEqual([]);
    expect(
      findBoundaryViolations(
        "src/application/adapters/postgres/unregistered-writer.ts",
        'const example = "tx.update(sourceDocuments)"; // tx.delete(sourceDocuments)'
      )
    ).toEqual([]);
  });
});
