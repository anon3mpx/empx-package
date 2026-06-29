import assert from "node:assert/strict";
import * as root from "../index.js";

const requiredRootExports = [
  "createRouter",
  "createAffiliateRouter",
  "createRouters",
  "getAllChainRouters",
  "setProtocolFeeBps",
  "getProtocolFeeBps",
  "enablePairTypeFees",
  "disablePairTypeFees",
  "connectMetaMask",
  "connectRabby",
  "connectInjected",
  "connectWagmi",
  "TOOL_SCHEMAS",
  "prepareWalletSwap",
  "parseWalletCapabilities",
  "canSendWalletCalls",
  "signPermit",
  "toViemTransaction",
  "toWagmiTransaction",
] as const;

for (const key of requiredRootExports) {
  assert.notEqual(root[key], undefined, `missing root export: ${key}`);
}

const requiredToolSchemas = [
  "prepareSwap",
  "executeSwap",
  "getApprovalCalldataForAmount",
] as const;

for (const key of requiredToolSchemas) {
  assert.notEqual(root.TOOL_SCHEMAS[key], undefined, `missing tool schema: ${key}`);
}

console.log("package-surface: required root exports and tool schemas present");
