#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const FEATURE_MESSAGES = JSON.parse(
  fs.readFileSync(path.join(root, "src", "i18n", "client-feature-message-map.json"), "utf8")
);
for (const locale of ["en", "zh"]) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8")
  );
  const directory = path.join(root, "messages", locale);
  fs.mkdirSync(directory, { recursive: true });
  for (const [feature, namespaces] of Object.entries(FEATURE_MESSAGES)) {
    const selected = Object.fromEntries(
      namespaces
        .filter((namespace) => namespace in catalog)
        .map((namespace) => [namespace, catalog[namespace]])
    );
    fs.writeFileSync(
      path.join(directory, `${feature}.json`),
      `${JSON.stringify(selected, null, 2)}\n`,
      "utf8"
    );
  }
}
