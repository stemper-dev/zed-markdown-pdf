#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = require.resolve("mermaid/dist/mermaid.min.js", {
  paths: [path.join(repositoryRoot, "sidecar")],
});
const destinationDir = path.join(repositoryRoot, "sidecar", "dist", "vendor");
const destination = path.join(destinationDir, "mermaid.min.js");

await fs.mkdir(destinationDir, { recursive: true });
await fs.copyFile(source, destination);
