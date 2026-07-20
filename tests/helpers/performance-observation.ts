import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PerformanceEvidenceClass =
  | "confirmed-structural"
  | "confirmed-build"
  | "local-observation"
  | "external-validation-needed"
  | "not-observed";

export interface PerformanceFinding {
  id: string;
  category: "structural" | "r2-contract";
  evidenceClass: PerformanceEvidenceClass;
  title: string;
  summary: string;
  location: string;
}

interface StructuralObservationArtifact {
  schemaVersion: 1;
  status: "completed";
  findings: PerformanceFinding[];
}

const artifactPath = path.resolve(process.cwd(), ".tmp/performance/structural-analysis.json");
let writeQueue = Promise.resolve();

async function readArtifact(): Promise<StructuralObservationArtifact> {
  try {
    return JSON.parse(await readFile(artifactPath, "utf8")) as StructuralObservationArtifact;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: 1, status: "completed", findings: [] };
  }
}

/** Persist deterministic test evidence without storing request data, credentials, or file bytes. */
export function recordPerformanceFindings(findings: readonly PerformanceFinding[]): Promise<void> {
  const write = async () => {
    const artifact = await readArtifact();
    const byId = new Map(artifact.findings.map((finding) => [finding.id, finding]));
    for (const finding of findings) byId.set(finding.id, finding);
    artifact.findings = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));

    await mkdir(path.dirname(artifactPath), { recursive: true });
    const temporaryPath = `${artifactPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await rename(temporaryPath, artifactPath);
  };
  writeQueue = writeQueue.then(write, write);
  return writeQueue;
}
