#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const reviewDirectory = path.resolve("docs/code-review");
const proposalPath = path.join(reviewDirectory, "PROPOSAL.md");
const reportNames = [
  "01-auth.md",
  "02-currency.md",
  "03-ledger.md",
  "04-source-document.md",
  "05-stats.md",
  "06-workspace.md",
  "07-routing-entry.md",
  "08-application.md",
  "09-persistence.md",
  "10-lib.md",
  "11-shared-ui-i18n.md",
];
const severities = new Map([
  ["高优先级", "high"],
  ["中优先级", "medium"],
  ["低优先级", "low"],
]);

function extractFindings(filename) {
  const area = filename.slice(0, 2);
  const findings = new Map();
  let severity = null;
  for (const line of readFileSync(path.join(reviewDirectory, filename), "utf8").split(/\r?\n/)) {
    const heading = /^## (.+?)(?: \(.+\))?$/.exec(line);
    if (heading != null) {
      severity = severities.get(heading[1]) ?? null;
      continue;
    }
    if (severity == null) continue;
    const topLevel = /^(\d+)\. \*\*/.exec(line);
    const child = /^\s+- (\d+[a-z])\s/.exec(line);
    const localId = topLevel?.[1] ?? child?.[1];
    if (localId != null) findings.set(`${area}#${localId}`, severity);
  }
  return findings;
}

function fail(errors) {
  for (const error of errors) console.error(`[validate:review] ${error}`);
  process.exit(1);
}

const expected = new Map(reportNames.flatMap((filename) => [...extractFindings(filename)]));
const proposal = readFileSync(proposalPath, "utf8");
const match =
  /<!-- review-matrix:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- review-matrix:end -->/.exec(
    proposal
  );
if (match == null) fail(["PROPOSAL.md is missing its machine-readable review matrix"]);

let encodedRecords;
try {
  encodedRecords = JSON.parse(match[1]);
} catch (error) {
  fail([
    `review matrix is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
  ]);
}
if (!Array.isArray(encodedRecords)) fail(["review matrix root must be an array"]);

const fields = [
  "id",
  "severity",
  "disposition",
  "delivery",
  "owner",
  "batch",
  "locations",
  "tests",
  "rationale",
  "duplicateOf",
];
const records = encodedRecords.map((encoded, index) => {
  if (typeof encoded !== "string") return encoded;
  const values = encoded.split("|");
  if (values.length < fields.length - 1 || values.length > fields.length) {
    return { id: `record ${index + 1}`, malformed: true };
  }
  return Object.fromEntries(
    fields.flatMap((field, fieldIndex) =>
      values[fieldIndex] == null || values[fieldIndex] === "" ? [] : [[field, values[fieldIndex]]]
    )
  );
});

const errors = [];
const seenIds = new Set();
const seenOwners = new Set();
const allowedDispositions = new Set(["confirmed", "duplicate", "expected", "accepted-risk"]);
const allowedDeliveries = new Set(["planned", "fixed", "not-applicable"]);
const byId = new Map(records.map((record) => [record.id, record]));

for (const [index, record] of records.entries()) {
  const label = record?.id ?? `record ${index + 1}`;
  if (typeof record !== "object" || record == null || Array.isArray(record)) {
    errors.push(`record ${index + 1} must be an object`);
    continue;
  }
  if (record.malformed === true) errors.push(`${label} has an invalid pipe-delimited shape`);
  for (const field of fields.slice(0, 9)) {
    if (typeof record[field] !== "string" || record[field].trim() === "") {
      errors.push(`${label} has no ${field}`);
    }
  }
  if (seenIds.has(record.id)) errors.push(`${label} appears more than once`);
  seenIds.add(record.id);
  if (!expected.has(record.id)) errors.push(`${label} is not present in the review reports`);
  if (expected.get(record.id) !== record.severity) {
    errors.push(`${label} severity must be ${expected.get(record.id) ?? "unknown"}`);
  }
  if (!allowedDispositions.has(record.disposition)) {
    errors.push(`${label} has invalid disposition ${record.disposition}`);
  }
  if (!allowedDeliveries.has(record.delivery)) {
    errors.push(`${label} has invalid delivery ${record.delivery}`);
  }
  if (seenOwners.has(record.owner)) errors.push(`${label} reuses owner ${record.owner}`);
  seenOwners.add(record.owner);
  if (record.disposition === "duplicate") {
    if (typeof record.duplicateOf !== "string" || record.duplicateOf === record.id) {
      errors.push(`${label} must reference a different primary finding`);
    }
  } else if (record.duplicateOf != null) {
    errors.push(`${label} may only set duplicateOf when disposition is duplicate`);
  }
  if (["expected", "accepted-risk"].includes(record.disposition)) {
    if (record.delivery !== "not-applicable") {
      errors.push(`${label} must use not-applicable delivery for ${record.disposition}`);
    }
  } else if (record.delivery === "not-applicable" && record.disposition !== "duplicate") {
    errors.push(`${label} may not use not-applicable delivery for ${record.disposition}`);
  }
  if (
    record.disposition === "confirmed" &&
    record.delivery === "fixed" &&
    record.batch === "PENDING"
  ) {
    errors.push(`${label} is fixed but has no delivery batch`);
  }
}

for (const id of expected.keys()) {
  if (!seenIds.has(id)) errors.push(`${id} is missing from the review matrix`);
}

for (const record of records) {
  if (record?.disposition !== "duplicate") continue;
  const visited = new Set([record.id]);
  let targetId = record.duplicateOf;
  while (targetId != null) {
    if (visited.has(targetId)) {
      errors.push(`${record.id} has a duplicate reference cycle`);
      break;
    }
    visited.add(targetId);
    const target = byId.get(targetId);
    if (target == null) {
      errors.push(`${record.id} references unknown primary finding ${targetId}`);
      break;
    }
    targetId = target.disposition === "duplicate" ? target.duplicateOf : null;
  }
}

if (errors.length > 0) fail(errors);
console.log(
  `[validate:review] ${records.length} findings covered across ${reportNames.length} reports.`
);
