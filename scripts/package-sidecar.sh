#!/usr/bin/env bash
# Build the sidecar into a release-ready tarball that the WASM coordinator
# downloads from GitHub releases at runtime. The tarball must contain:
#   dist/server.js
#   package.json
#   package-lock.json
#   node_modules/   (production-only)
#
# Usage:  ./scripts/package-sidecar.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
cd sidecar

echo "==> Installing dependencies (incl. dev, needed for tsc; lifecycle scripts disabled)"
npm ci --ignore-scripts --silent

echo "==> Compiling TypeScript"
npm run build --silent

echo "==> Pruning to production dependencies"
npm prune --omit=dev --ignore-scripts --silent

OUT="$ROOT/markdown-pdf-sidecar.tar.gz"
echo "==> Bundling -> $OUT"
tar -czf "$OUT" dist package.json package-lock.json node_modules

echo "Done.  Asset: $OUT"
