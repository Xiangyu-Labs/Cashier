import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fromRoot = (path: string) => resolve(root, path);

const retiredPaths = [
  "src/modules/task-queue",
  "src/app/api/v1/categories",
  "src/app/api/v1/entries",
  "src/app/api/v1/stats",
  "src/app/api/v1/task",
  "src/modules/ledger/ui/ExportSection.tsx",
  "src/modules/ledger/application/use-cases/export-ledger-entries.ts",
  "src/modules/ledger/application/use-cases/submit-categorize-tasks.ts",
  "src/modules/ledger/application/tasks/categorize-entry.ts",
  "src/modules/ledger/application/tasks/generate-category-metadata.ts",
  "src/modules/ledger/server-actions/categorize.ts",
  "src/components/ui/image-editor.tsx",
  "src/components/ui/image-editor-crop-pane.tsx",
  "src/components/ui/image-editor-draw-pane.tsx",
  "src/components/ui/image-editor-toolbar.tsx",
  "src/components/ui/image-editor.core.ts",
  "src/components/ui/image-editor.types.ts",
  "src/components/ui/image-editor.utils.ts",
  "src/modules/auth/ui/ChangeEmailForm.tsx",
  "src/modules/auth/ui/ClearDataForm.tsx",
  "src/modules/auth/ui/DeleteAccountForm.tsx",
  "Dockerfile",
  "docker-compose.yml",
  "docker-entrypoint.sh",
  ".dockerignore",
  "public/push-worker.js",
  "tests/smoke",
];

describe("retired feature governance", () => {
  it.each(retiredPaths)("keeps %s removed", (path) => {
    expect(existsSync(fromRoot(path))).toBe(false);
  });

  it("keeps API v1 source documents write-only", () => {
    const route = readFileSync(fromRoot("src/app/api/v1/source-documents/route.ts"), "utf8");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function GET");
  });

  it("keeps retired dependencies and Docker commands out of package.json", () => {
    const manifest = JSON.parse(readFileSync(fromRoot("package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies).not.toHaveProperty("react-image-crop");
    expect(Object.keys(manifest.scripts).some((name) => name.startsWith("docker:"))).toBe(false);
  });

  it("keeps the retained PWA limited to static precaching", () => {
    const config = readFileSync(fromRoot("next.config.ts"), "utf8");
    expect(config).toContain("cacheOnFrontEndNav: false");
    expect(config).toContain("aggressiveFrontEndNavCaching: false");
    expect(config).toContain("cacheStartUrl: false");
    expect(config).toContain("dynamicStartUrl: false");
    expect(config).toContain("runtimeCaching: []");
    expect(config).not.toContain("importScripts");
    expect(existsSync(fromRoot("src/app/manifest.ts"))).toBe(true);
  });

  it("removes retired callable contracts and export configuration", () => {
    const boundaries = [
      "src/modules/ledger/contracts.ts",
      "src/modules/ledger/actions.ts",
      "src/modules/source-document/contracts.ts",
      "src/modules/source-document/actions.ts",
      "src/lib/env/runtime.ts",
      "src/lib/env/startup.ts",
      ".env.example",
    ]
      .map((path) => readFileSync(fromRoot(path), "utf8"))
      .join("\n");
    expect(boundaries).not.toMatch(
      /CategoriesResponseDto|ExportResult|ExportLedgerEntriesOptions|CategorizeResult|BatchDeleteSourceDocumentsResultDto|BatchRetrySourceDocumentItemDto|BatchRetrySourceDocumentsResultDto|ProcessingTaskStatusDto|ProcessingTaskDto|ProcessingStatsDto|sourceDocumentIdsSchema|EXPORT_MAX_ENTRIES/
    );
  });

  it("does not remove infrastructure that is replaced in the next phase", () => {
    expect(existsSync(fromRoot("src/lib/tasks/runtime.ts"))).toBe(true);
    expect(existsSync(fromRoot("src/lib/storage/local.ts"))).toBe(true);
    expect(existsSync(fromRoot("src/persistence/schema/ledger.ts"))).toBe(true);
  });
});
