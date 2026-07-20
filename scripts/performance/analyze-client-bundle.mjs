import { createRequire } from "node:module";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTE = "/[locale]/(protected)/page";
const SCHEMA_VERSION = 1;

const metricDefinitions = [
  {
    key: "localeProvider",
    label: "Locale provider",
    source: "client-reference",
    required: true,
    moduleMarkers: ["/src/components/providers.tsx"],
  },
  {
    key: "authenticatedPage",
    label: "Authenticated page",
    source: "client-reference",
    required: true,
    moduleMarkers: ["/src/modules/workspace/ui/LedgerPageClient.tsx"],
  },
  {
    key: "defaultStream",
    label: "Default stream",
    source: "client-reference",
    required: true,
    moduleMarkers: ["/src/modules/workspace/ui/LedgerPageClient.tsx"],
  },
  {
    key: "inactiveTabs",
    label: "Inactive tabs",
    source: "react-loadable",
    required: true,
    loadableMarkers: [
      "@/modules/workspace/ui/DetailsTab",
      "@/modules/workspace/ui/StatsTab",
      "@/modules/ledger/ui",
    ],
  },
  {
    key: "forms",
    label: "Forms",
    source: "react-loadable",
    required: true,
    loadableMarkers: ["@/modules/source-document/ui"],
  },
  {
    key: "modalRenderer",
    label: "Modal renderer",
    source: "react-loadable",
    required: true,
    loadableMarkers: ["@/components/providers/ModalStackRenderer"],
  },
  {
    key: "settingsDragAndDrop",
    label: "Settings and drag-and-drop",
    source: "react-loadable",
    required: true,
    loadableMarkers: ["@/modules/ledger/ui"],
  },
  {
    key: "environmentValidation",
    label: "Environment validation",
    source: "client-reference",
    required: false,
    moduleMarkers: ["/src/lib/env/public.ts", "/src/lib/env/runtime.ts"],
  },
];

export class ManifestAnalysisError extends Error {
  constructor(message) {
    super(message);
    this.name = "ManifestAnalysisError";
  }
}

function relativeClientPath(file) {
  return file.replace(/^static\//, "");
}

function isJavaScriptChunk(file) {
  return typeof file === "string" && file.startsWith("static/") && file.endsWith(".js");
}

async function readJson(file, name) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ManifestAnalysisError(`Missing ${name}: ${file}`);
    }
    throw new ManifestAnalysisError(`Could not parse ${name}: ${error.message}`);
  }
}

export async function loadClientReferenceManifest(file, route = ROUTE) {
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ManifestAnalysisError(`Missing client-reference manifest: ${file}`);
    }
    throw error;
  }

  const globalThisValue = {};
  try {
    // Next emits a data assignment rather than JSON for this manifest.
    new Function("globalThis", source)(globalThisValue);
  } catch (error) {
    throw new ManifestAnalysisError(`Could not evaluate client-reference manifest: ${error.message}`);
  }

  const manifest = globalThisValue.__RSC_MANIFEST?.[route];
  if (manifest == null || typeof manifest.clientModules !== "object") {
    throw new ManifestAnalysisError(`Client-reference manifest does not contain clientModules for route ${route}`);
  }
  return manifest;
}

function matchingClientModules(clientModules, markers) {
  return Object.entries(clientModules).filter(([modulePath]) =>
    markers.some((marker) => modulePath.endsWith(marker))
  );
}

function matchingLoadableEntries(loadableManifest, markers) {
  return Object.entries(loadableManifest).filter(([entry]) => markers.some((marker) => entry.endsWith(marker)));
}

async function measureFiles(projectRoot, files) {
  const chunks = [];
  for (const file of [...new Set(files)].sort()) {
    const relativePath = relativeClientPath(file);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(relativePath);
    } catch {
      throw new ManifestAnalysisError(`Manifest contains an invalid encoded client chunk path: ${file}`);
    }
    const staticRoot = path.resolve(projectRoot, ".next", "static");
    const absolutePath = path.resolve(staticRoot, decodedPath);
    if (!absolutePath.startsWith(`${staticRoot}${path.sep}`)) {
      throw new ManifestAnalysisError(`Manifest client chunk path escapes the build output: ${file}`);
    }
    let contents;
    try {
      contents = await readFile(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new ManifestAnalysisError(`Manifest references missing client chunk: ${file}`);
      }
      throw error;
    }
    chunks.push({
      path: file,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }
  return chunks;
}

async function buildMetric({ definition, projectRoot, clientModules, loadableManifest }) {
  const matches = definition.source === "client-reference"
    ? matchingClientModules(clientModules, definition.moduleMarkers)
    : matchingLoadableEntries(loadableManifest, definition.loadableMarkers);

  if (matches.length === 0) {
    if (definition.required) {
      throw new ManifestAnalysisError(
        `Could not find required ${definition.label.toLowerCase()} marker in ${definition.source} manifest`
      );
    }
    return {
      label: definition.label,
      status: "not-observed",
      source: definition.source,
      markers: definition.moduleMarkers ?? definition.loadableMarkers,
      reason: "The marker is not in this route's client graph; no byte metric was inferred.",
    };
  }

  const files = matches.flatMap(([, value]) => value.files ?? value.chunks ?? []).filter(isJavaScriptChunk);
  if (files.length === 0) {
    const reason = `Matched ${definition.label.toLowerCase()} manifest entries do not reference JavaScript client chunks; no byte metric was inferred.`;
    if (definition.required) {
      throw new ManifestAnalysisError(`Required ${reason}`);
    }
    return {
      label: definition.label,
      status: "not-observed",
      source: definition.source,
      markers: definition.moduleMarkers ?? definition.loadableMarkers,
      matchedModules: matches.map(([key]) => key),
      reason,
    };
  }
  const chunks = await measureFiles(projectRoot, files);
  return {
    label: definition.label,
    status: "measured",
    source: definition.source,
    markers: definition.moduleMarkers ?? definition.loadableMarkers,
    matchedModules: matches.map(([key]) => key),
    rawBytes: chunks.reduce((total, chunk) => total + chunk.rawBytes, 0),
    gzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
    chunks,
  };
}

async function assertFresh(manifestFiles, buildStartedAt) {
  if (buildStartedAt == null) return;
  for (const file of manifestFiles) {
    let details;
    try {
      details = await stat(file);
    } catch (error) {
      if (error?.code === "ENOENT") throw new ManifestAnalysisError(`Missing build output: ${file}`);
      throw error;
    }
    if (details.mtimeMs < buildStartedAt) {
      throw new ManifestAnalysisError(`Stale manifest rejected: ${file} predates this build invocation`);
    }
  }
}

export async function analyzeClientBundle({
  projectRoot = SCRIPT_ROOT,
  buildStartedAt,
  outputFile = path.join(projectRoot, ".tmp/performance/client-bundle-analysis.json"),
} = {}) {
  const nextRoot = path.join(projectRoot, ".next");
  const clientReferenceFile = path.join(nextRoot, "server/app/[locale]/(protected)/page_client-reference-manifest.js");
  const loadableFile = path.join(nextRoot, "react-loadable-manifest.json");
  const buildIdFile = path.join(nextRoot, "BUILD_ID");
  await assertFresh([clientReferenceFile, loadableFile, buildIdFile], buildStartedAt);

  const [clientReference, loadableManifest, buildId] = await Promise.all([
    loadClientReferenceManifest(clientReferenceFile),
    readJson(loadableFile, "react-loadable manifest"),
    readFile(buildIdFile, "utf8").catch((error) => {
      if (error?.code === "ENOENT") throw new ManifestAnalysisError(`Missing build output: ${buildIdFile}`);
      throw error;
    }),
  ]);

  const metrics = {};
  for (const definition of metricDefinitions) {
    metrics[definition.key] = await buildMetric({
      definition,
      projectRoot,
      clientModules: clientReference.clientModules,
      loadableManifest,
    });
  }

  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: "completed",
    generatedAt: new Date().toISOString(),
    route: ROUTE,
    buildId: buildId.trim(),
    manifests: {
      clientReference: path.relative(projectRoot, clientReferenceFile),
      reactLoadable: path.relative(projectRoot, loadableFile),
    },
    metrics,
  };

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  const build = process.argv.includes("--build");
  const startedAt = Date.now();
  if (build) await run(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], SCRIPT_ROOT);
  const result = await analyzeClientBundle({ projectRoot: SCRIPT_ROOT, buildStartedAt: build ? startedAt : undefined });
  console.log(JSON.stringify({ output: ".tmp/performance/client-bundle-analysis.json", defaultStream: result.metrics.defaultStream }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Bundle analysis failed: ${error.message}`);
    process.exitCode = 1;
  });
}
