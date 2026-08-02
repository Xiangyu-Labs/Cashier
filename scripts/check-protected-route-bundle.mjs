import fs from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";

const manifestPath = ".next/server/app/[locale]/(protected)/page_client-reference-manifest.js";
const routeKey = "/[locale]/(protected)/page";
const maximumGzipBytes = 258_788;

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Protected-route client manifest is missing: ${manifestPath}`);
}

const context = {};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(manifestPath, "utf8"), context, { filename: manifestPath });
const manifest = context.__RSC_MANIFEST?.[routeKey];
if (manifest == null) throw new Error(`Protected-route manifest entry is missing: ${routeKey}`);

const files = new Set();
for (const clientModule of Object.values(manifest.clientModules)) {
  for (const chunk of clientModule.chunks ?? []) {
    if (chunk.endsWith(".js")) files.add(decodeURIComponent(chunk));
  }
}

let gzipBytes = 0;
for (const file of files) {
  gzipBytes += zlib.gzipSync(fs.readFileSync(`.next/${file}`)).byteLength;
}

console.log(
  `Protected route client footprint: ${gzipBytes} gzip bytes across ${files.size} chunks (budget ${maximumGzipBytes})`
);
if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `Protected route client footprint exceeded its budget (${gzipBytes} > ${maximumGzipBytes})`
  );
}
