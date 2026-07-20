import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

export interface BrowserResourceObservation {
  url: string;
  resourceType: string;
  status: number | null;
  transferSize: number | null;
}

export interface BrowserWorkflowObservation {
  name: string;
  durationMs: number;
  result: "passed" | "external-validation-needed";
}

export interface BrowserObservationArtifact {
  schemaVersion: 1;
  status: "completed";
  environment: "local-dev-test-only";
  workflows: BrowserWorkflowObservation[];
  resources: BrowserResourceObservation[];
  limitations: string[];
}

const artifactPath = path.resolve(process.cwd(), ".tmp/performance/browser-workflows.json");

/** Remove values, credentials, and identifiers while retaining a request path's shape. */
export function redactRequestUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const queryKeys = [...url.searchParams.keys()].sort();
  url.search = queryKeys.length === 0 ? "" : `?${queryKeys.map((key) => `${encodeURIComponent(key)}=REDACTED`).join("&")}`;
  url.hash = "";
  return url.toString();
}

export function observeResources(page: Page): BrowserResourceObservation[] {
  const resources: BrowserResourceObservation[] = [];
  const seen = new Set<string>();

  page.on("response", (response) => {
    const request = response.request();
    const observation: BrowserResourceObservation = {
      url: redactRequestUrl(request.url()),
      resourceType: request.resourceType(),
      status: response.status(),
      // Playwright's public API does not expose a transfer size for every response.
      transferSize: null,
    };
    const key = `${observation.url}|${observation.resourceType}|${observation.status}`;
    if (!seen.has(key)) {
      seen.add(key);
      resources.push(observation);
    }
  });

  return resources;
}

export function recordUrl(url: string, resourceType: string, resources: BrowserResourceObservation[]): void {
  const observation: BrowserResourceObservation = {
    url: redactRequestUrl(url),
    resourceType,
    status: null,
    transferSize: null,
  };
  if (!resources.some((item) => item.url === observation.url && item.resourceType === observation.resourceType)) {
    resources.push(observation);
  }
}

export async function collectExposedTransferSizes(
  page: Page,
  resources: BrowserResourceObservation[]
): Promise<void> {
  const entries = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => {
      const timing = entry as PerformanceResourceTiming;
      return { url: timing.name, transferSize: timing.transferSize };
    })
  );
  for (const entry of entries) {
    const url = redactRequestUrl(entry.url);
    for (const resource of resources) {
      if (resource.url === url && entry.transferSize > 0) resource.transferSize = entry.transferSize;
    }
  }
}

export async function writeBrowserObservations(
  workflows: BrowserWorkflowObservation[],
  resources: BrowserResourceObservation[]
): Promise<void> {
  const artifact: BrowserObservationArtifact = {
    schemaVersion: 1,
    status: "completed",
    environment: "local-dev-test-only",
    workflows,
    resources: resources.sort((left, right) => left.url.localeCompare(right.url)),
    limitations: [
      "Durations are local development observations only and are not production latency or CI budgets.",
      "Request URLs retain only query parameter names; values, cookies, tokens, user IDs, and file bytes are not recorded.",
      "Upload and stored-file route accesses use non-sensitive missing IDs to confirm route availability, not object storage transfer behavior.",
    ],
  };

  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
}
