import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const requiredFiles = [
  "dist/cjs/index.js",
  "dist/cjs/wallet.js",
  "dist/cjs/agent/schemas.js",
  "dist/cjs/adapters/viem.js",
  "dist/cjs/adapters/wagmi.js",
  "dist/cjs/chains/all_chains.json",
  "dist/cjs/core/abi_data.json",
  "dist/esm/index.js",
  "dist/esm/wallet.js",
  "dist/esm/agent/schemas.js",
  "dist/esm/adapters/viem.js",
  "dist/esm/adapters/wagmi.js",
  "dist/esm/chains/all_chains.json",
  "dist/esm/core/abi_data.json",
  "dist/esm/package.json",
];

for (const file of requiredFiles) {
  assert.equal(existsSync(file), true, `missing built package file: ${file}`);
}

const cjsRoot = execSync("node -e \"const sdk=require('./dist/cjs'); console.log(typeof sdk.createRouter)\"").toString().trim();
assert.equal(cjsRoot, "function");

const cjsWallet = execSync("node -e \"const wallet=require('./dist/cjs/wallet.js'); console.log(typeof wallet.createBurnerWallet)\"").toString().trim();
assert.equal(cjsWallet, "function");

const cjsWagmi = execSync("node -e \"const wagmi=require('./dist/cjs/adapters/wagmi.js'); console.log(typeof wagmi.toWagmiTransaction)\"").toString().trim();
assert.equal(cjsWagmi, "function");

const esmRoot = execSync("node --input-type=module -e \"const sdk=await import('./dist/esm/index.js'); console.log(typeof sdk.createRouter)\"").toString().trim();
assert.equal(esmRoot, "function");

const esmWallet = execSync("node --input-type=module -e \"const wallet=await import('./dist/esm/wallet.js'); console.log(typeof wallet.createBurnerWallet)\"").toString().trim();
assert.equal(esmWallet, "function");

const esmWagmi = execSync("node --input-type=module -e \"const wagmi=await import('./dist/esm/adapters/wagmi.js'); console.log(typeof wagmi.toWagmiTransaction)\"").toString().trim();
assert.equal(esmWagmi, "function");

console.log("package-build: CJS and ESM outputs load");
