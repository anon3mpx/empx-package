// ─── Post-build asset copier ────────────────────────────────────────────────
//
// tsc does NOT copy non-TypeScript assets (.json, etc.) from src/ to dist/.
// The SDK's runtime code uses require("./abi_data.json") and JSON imports
// from src/chains/all_chains.json — both need to be present in dist/ at
// the matching relative paths or consumers blow up at module-load time
// with "Cannot find module './abi_data.json'".
//
// This script runs after `tsc` and mirrors every JSON file from src/ to
// dist/ preserving the directory structure.  Cross-platform (no cp/sh).

import { mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const SRC_ROOT = "src";
const DIST_ROOT = "dist";

function walk(dir, callback) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, callback);
    } else {
      callback(full);
    }
  }
}

let copied = 0;
walk(SRC_ROOT, (file) => {
  if (!file.endsWith(".json")) return;
  const rel = relative(SRC_ROOT, file);
  const dest = join(DIST_ROOT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  copied += 1;
  console.log(`  copied ${rel}`);
});

console.log(`Copied ${copied} asset file(s) to ${DIST_ROOT}/`);
