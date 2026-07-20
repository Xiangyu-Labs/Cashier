import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUNDLE = ".tmp/performance/client-bundle-analysis.json";
const DEFAULT_REPORT = "docs/formless/reports/2026-07-20-performance-validation-baseline.md";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function optionalJson(projectRoot, relativePath) {
  if (relativePath == null) return null;
  try {
    return JSON.parse(await readFile(path.resolve(projectRoot, relativePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function command(command, args) {
  try {
    return execFileSync(command, args, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function layerStatus(value, name) {
  if (value == null) return `${name}: skipped (artifact not supplied)`;
  return `${name}: ${value.status ?? "recorded"}`;
}

function hasCompletedBundle(bundle) {
  return (
    bundle?.status === "completed" && bundle.metrics != null && typeof bundle.metrics === "object"
  );
}

function unavailableBundleCandidateRows(bundle) {
  const classification =
    bundle == null || bundle.status === "skipped"
      ? "not-observed"
      : bundle.status === "blocked"
        ? "not-observed"
        : "external-validation-needed";
  const status = bundle?.status ?? "artifact not supplied";
  const evidence = `Bundle analysis ${status}; no fresh webpack manifest metric is available`;
  const nextValidation =
    "Complete a fresh production webpack bundle analysis before classifying this candidate";

  return [
    `| Default stream client graph | ${classification} | ${evidence} | ${nextValidation} |`,
    `| Inactive tabs and forms | ${classification} | ${evidence} | ${nextValidation} |`,
  ].join("\n");
}

function bundleCandidateRows(bundle) {
  if (!hasCompletedBundle(bundle)) return unavailableBundleCandidateRows(bundle);
  return [
    "| Default stream client graph | confirmed-build | Fresh completed webpack manifest metric | Compare after feature-boundary changes |",
    "| Inactive tabs and forms | confirmed-build | Completed loadable-manifest metrics | Verify they remain outside the default stream |",
  ].join("\n");
}

function findingRows(structural, category) {
  const findings = structural?.findings?.filter((finding) => finding.category === category) ?? [];
  if (findings.length === 0) {
    return "| No finding recorded | not-observed | No completed structural artifact for this category | Re-run the deterministic performance project |";
  }
  return findings
    .map(
      (finding) =>
        `| ${finding.title} | ${finding.evidenceClass} | ${finding.summary} | ${finding.location} |`
    )
    .join("\n");
}

function metricRows(metrics) {
  return Object.entries(metrics)
    .map(([key, metric]) => {
      if (metric.status !== "measured") return `| ${key} | ${metric.status} | - | - | ${metric.reason} |`;
      return `| ${key} | measured | ${formatBytes(metric.rawBytes)} | ${formatBytes(metric.gzipBytes)} | ${metric.chunks.length} unique chunks |`;
    })
    .join("\n");
}

function browserWorkflowRows(browser) {
  if (browser?.status !== "completed" || !Array.isArray(browser.workflows) || browser.workflows.length === 0) {
    const reason = browser?.reason ?? "No local browser artifact";
    const remediation = browser?.remediation ?? "Install Chromium and run npm run test:performance:browser";
    return `| No browser workflow recorded | ${browser?.status ?? "skipped"} | ${reason} | ${remediation} |`;
  }
  return browser.workflows
    .map(
      (workflow) =>
        `| ${workflow.name} | local-observation | ${workflow.durationMs} ms (local development only) | Compare only in a preview deployment |`
    )
    .join("\n");
}

function browserCandidateRow(browser) {
  if (browser?.status === "completed") {
    return "| Local browser workflow shape | local-observation | Authenticated local route, request/resource, and duration observations | Validate with preview deployment and representative data |";
  }
  return `| Local browser workflow shape | not-observed | ${browser?.reason ?? "No local browser artifact"} | ${browser?.remediation ?? "Install Chromium and run npm run test:performance:browser"} |`;
}

export async function writePerformanceReport({
  projectRoot = PROJECT_ROOT,
  bundlePath = DEFAULT_BUNDLE,
  structuralPath,
  browserPath,
  reportPath = DEFAULT_REPORT,
} = {}) {
  const [bundle, structural, browser] = await Promise.all([
    optionalJson(projectRoot, bundlePath),
    optionalJson(projectRoot, structuralPath),
    optionalJson(projectRoot, browserPath),
  ]);
  const report = `# Performance Validation Baseline\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `## Reproducibility\n\n` +
    `- Commit: ${command("git", ["rev-parse", "HEAD"])}\n` +
    `- Node: ${process.version}\n` +
    `- Aggregate command: \`npm run report:performance\`\n` +
    `- Browser prerequisite: \`npx playwright install chromium\`\n` +
    `- Client route: ${bundle?.route ?? "not analyzed"}\n` +
    `- Build ID: ${bundle?.buildId ?? "not analyzed"}\n\n` +
    `## Evidence Taxonomy\n\n` +
    `- **Confirmed**: directly measured by a fresh local production webpack build or deterministic test.\n` +
    `- **Observed locally**: recorded by a local browser workflow; it is not cloud latency evidence.\n` +
    `- **External validation needed**: requires a preview/production-like deployment, representative data, and regional context.\n` +
    `- **Skipped or blocked**: no result was collected; it is never interpreted as zero.\n\n` +
    `## Collection Status\n\n` +
    `- ${layerStatus(bundle, "Bundle analysis")}\n` +
    `- ${layerStatus(structural, "Structural checks")}\n` +
    `- ${layerStatus(browser, "Browser workflow")}\n\n` +
    `## Client Graph Metrics\n\n` +
    (!hasCompletedBundle(bundle)
      ? `Bundle analysis is ${bundle?.status ?? "skipped"}; no client byte metric is available.\n`
      : `| Graph | Status | Raw | Gzip | Detail |\n| --- | --- | ---: | ---: | --- |\n${metricRows(bundle.metrics)}\n`) +
    `\n## Candidate Classification\n\n` +
    `| Candidate | Classification | Evidence | Next validation |\n| --- | --- | --- | --- |\n` +
    `${bundleCandidateRows(bundle)}\n` +
    `${browserCandidateRow(browser)}\n` +
    `| Browser workflow duration | external-validation-needed | Local durations are never cloud latency evidence | Preview deployment, same seeded dataset, three-run median |\n` +
    `| Database and R2 latency | external-validation-needed | Not collected by this harness | Instrument preview/production-like requests without sensitive data |\n\n` +
    `## Deterministic Structural Findings\n\n` +
    `| Finding | Classification | Evidence | Test location |\n| --- | --- | --- | --- |\n` +
    `${findingRows(structural, "structural")}\n\n` +
    `## R2 Contract Findings\n\n` +
    `| Finding | Classification | Evidence | Test location |\n| --- | --- | --- | --- |\n` +
    `${findingRows(structural, "r2-contract")}\n\n` +
    `## Local Browser Workflow Observations\n\n` +
    `| Workflow | Classification | Local evidence | Next validation |\n| --- | --- | --- | --- |\n` +
    `${browserWorkflowRows(browser)}\n\n` +
    `Resource observations retain URL paths, query parameter names, resource type, response status, and exposed transfer size only. Query values, cookies, tokens, user/ledger IDs, document content, and file bytes are never written. Failure screenshots and traces remain in ignored local output.\n\n` +
    `## Prioritized Confirmed Candidates\n\n` +
    `| Priority | Candidate | Affected workflow | Evidence | Boundary | Expected impact | Complexity | Risk | Recommended next action |\n| ---: | --- | --- | --- | --- | --- | --- | --- | --- |\n` +
    `| 1 | Default stream client graph | Authenticated home stream | confirmed-build client graph metric | Client JavaScript delivery | Lower initial client bytes | Medium | Medium | Compare a focused feature-boundary change against a fresh webpack analysis |\n` +
    `| 2 | Inactive tabs and forms | Tab intent and record entry | confirmed-build loadable-manifest metrics | Deferred feature loading | Avoid inactive feature cost before intent | Low | Low | Verify deferred boundaries remain outside the default stream |\n\n` +
    `Cloud database, R2, and network latency are intentionally not ranked because this harness has no production-like timing evidence.\n\n` +
    `## External Validation Checklist\n\n` +
    `- Use a preview or production-like deployment in the intended Vercel, Neon, R2, and user regions.\n` +
    `- Use the same seeded account, representative data volume, browser profile, and network profile before and after a change.\n` +
    `- Record at least three runs and compare medians; do not set a local-duration CI threshold.\n` +
    `- Capture application, database, and R2 timing separately without recording credentials, user identifiers, or document content.\n\n` +
    `## Limitations\n\n` +
    `This report measures emitted local JavaScript bytes and deterministic structure. It does not infer cloud latency, Vercel execution time, Neon query time, R2 transfer time, or user-perceived production performance.\n`;

  const absoluteReportPath = path.resolve(projectRoot, reportPath);
  await mkdir(path.dirname(absoluteReportPath), { recursive: true });
  await writeFile(absoluteReportPath, report);
  return { reportPath: absoluteReportPath, bundle, structural, browser };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writePerformanceReport({
    bundlePath: option("--bundle", DEFAULT_BUNDLE),
    structuralPath: option("--structural", undefined),
    browserPath: option("--browser", undefined),
    reportPath: option("--output", DEFAULT_REPORT),
  })
    .then(({ reportPath }) => console.log(`Wrote ${path.relative(PROJECT_ROOT, reportPath)}`))
    .catch((error) => {
      console.error(`Performance report failed: ${error.message}`);
      process.exitCode = 1;
    });
}
