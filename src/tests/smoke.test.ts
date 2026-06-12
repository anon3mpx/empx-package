// ─── Smoke Test: Validates imports, router creation, and core types ──────────
// Runs without any RPC calls — safe for CI/CD and offline use.
// Usage: npx tsx src/tests/smoke.test.ts

import {
  createRouter, createAffiliateRouter, createRouters, getAllChainRouters,
  getChainConfig, getAllChains, getSupportedChainIds,
  CHAIN_IDS, CHAINS, stripRouterAbi,
  getProtocolFeeBps, setProtocolFeeBps,
  EmpxError, ERROR_CODES,
  BASE_ROUTER_ABI, PLS_ROUTER_ABI, ETH_ROUTER_ABI,
  BASE_INTEGRATOR_ROUTER_ABI, PLS_INTEGRATOR_ROUTER_ABI, ETH_INTEGRATOR_ROUTER_ABI,
  ERC20_ABI,
  validateTradeParams, validateAffiliateConfig, isValidAddress, isPositiveBigInt,
  enablePairTypeFees, disablePairTypeFees, isPairTypeFeesEnabled,
  makeAffiliateConfig, classifyAffiliateTier, AFFILIATE_TIER_BPS,
  TOOL_SCHEMAS, getOpenAITools,
} from "../index.js";
import { ethers } from "ethers";

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) { passed++; return; }
  failed++;
  const msg = `FAIL: ${name}${detail ? ` — ${detail}` : ""}`;
  console.error(msg);
  errors.push(msg);
}

// ─── Chain registry ──────────────────────────────────────────────────────────

console.log("\n─── Chain registry ───");

const allChains = getAllChains();
assert(allChains.length >= 14, "getAllChains returns >= 14 chains", `got ${allChains.length}`);

const chainIds = getSupportedChainIds();
assert(chainIds.includes(42161), "getSupportedChainIds includes Arbitrum");
assert(chainIds.includes(369), "getSupportedChainIds includes PulseChain");
assert(chainIds.includes(56), "getSupportedChainIds includes BSC");

for (const id of [42161, 369, 8453, 56, 10, 137, 143]) {
  const cfg = getChainConfig(id);
  assert(!!cfg, `getChainConfig(${id}) returns config`);
  assert(!!cfg.ROUTER_ADDRESS, `Chain ${id} has ROUTER_ADDRESS`);
  assert(!!cfg.NATIVE_ADDRESS, `Chain ${id} has NATIVE_ADDRESS`);
  assert(!!cfg.WRAPPED_NATIVE, `Chain ${id} has WRAPPED_NATIVE`);
  assert(!!cfg.USD_STABLE, `Chain ${id} has USD_STABLE`);
  assert(cfg.STABLE_TOKENS.length > 0, `Chain ${id} has STABLE_TOKENS`);
  assert(cfg.TRUSTED_TOKENS.length > 0, `Chain ${id} has TRUSTED_TOKENS`);
  assert(cfg.ADAPTERS.length > 0, `Chain ${id} has ADAPTERS`);
  assert(!!cfg.routerAbi, `Chain ${id} has routerAbi`);
  assert(!!cfg.nativeSwapFns.fromNative, `Chain ${id} has nativeSwapFns.fromNative`);
  assert(!!cfg.nativeSwapFns.toNative, `Chain ${id} has nativeSwapFns.toNative`);
}

const stripped = stripRouterAbi(getChainConfig(42161));
assert(!("routerAbi" in stripped), "stripRouterAbi removes routerAbi");

assert(CHAIN_IDS.ARBITRUM === 42161, "CHAIN_IDS.ARBITRUM = 42161");
assert(CHAIN_IDS.BASE === 8453, "CHAIN_IDS.BASE = 8453");
assert(CHAIN_IDS.PULSECHAIN === 369, "CHAIN_IDS.PULSECHAIN = 369");
assert(!!CHAINS[42161], "CHAINS has Arbitrum entry");
assert(!!CHAINS[369], "CHAINS has PulseChain entry");

// ─── Router creation ─────────────────────────────────────────────────────────

console.log("\n─── Router creation ───");

// Standard router (uses default RPC behind the scenes, but creation itself is sync)
const arb = createRouter(42161);
assert(!!arb, "createRouter(42161) returns router");
assert(arb.chain.name === "Arbitrum One", "Router chain name");
assert(arb.chain.chainId === 42161, "Router chain ID");
assert(arb.provider !== null, "Router has provider");
assert(typeof arb.isSplitAvailable === "function", "isSplitAvailable is function");
assert(typeof arb.findBestPath === "function", "findBestPath is function");
assert(typeof arb.getTradeInfo === "function", "getTradeInfo is function");
assert(typeof arb.getSwapCalldata === "function", "getSwapCalldata is function");
assert(typeof arb.getSwapFromNativeCalldata === "function", "getSwapFromNativeCalldata is function");
assert(typeof arb.getSwapToNativeCalldata === "function", "getSwapToNativeCalldata is function");
assert(typeof arb.getWrapCalldata === "function", "getWrapCalldata is function");
assert(typeof arb.getUnwrapCalldata === "function", "getUnwrapCalldata is function");
assert(typeof arb.getApprovalCalldata === "function", "getApprovalCalldata is function");
assert(typeof arb.swap === "function", "swap is function");
assert(typeof arb.getTokenPriceUSD === "function", "getTokenPriceUSD is function");
assert(typeof arb.getQuoteUSD === "function", "getQuoteUSD is function");
assert(typeof arb.estimateAffiliateEarning === "function", "estimateAffiliateEarning is function");
assert(arb.affiliate === undefined, "No affiliate by default");
assert(arb.integratorId === undefined, "No integratorId by default");

// Affiliate router (V1 compat)
const affId = "0x" + "ab".repeat(32);
const affRouter = createAffiliateRouter(42161, affId, "https://arb1.arbitrum.io/rpc");
assert(!!affRouter, "createAffiliateRouter returns router");
assert(affRouter.integratorId === affId, "Affiliate router has integratorId");

// Router with off-chain affiliate config
const withAffiliate = createRouter(42161, "https://arb1.arbitrum.io/rpc", {
  affiliate: { address: "0x" + "de".repeat(20), feeBps: 2000 }
});
assert(!!withAffiliate.affiliate, "Router has affiliate config");
assert(withAffiliate.affiliate!.feeBps === 2000, "Affiliate feeBps = 2000");

// Router with BOTH models
const dual = createRouter(42161, "https://arb1.arbitrum.io/rpc", {
  integratorId: affId,
  affiliate: { address: "0x" + "ef".repeat(20), feeBps: 1000 }
});
assert(dual.integratorId === affId, "Dual router has integratorId");
assert(!!dual.affiliate, "Dual router has affiliate");
assert(dual.affiliate!.feeBps === 1000, "Dual router affiliate feeBps = 1000");

// With signer
const wallet = ethers.Wallet.createRandom();
const withSigner = createRouter(56, wallet);
assert(!!withSigner, "createRouter with Signer returns router");

// With fallback RPCs
const withFallback = createRouter(42161, [
  "https://arb-mainnet.g.alchemy.com/v2/test",
  "https://arb1.arbitrum.io/rpc",
]);
assert(withFallback.provider instanceof ethers.FallbackProvider, "createRouter with RPC array returns FallbackProvider");
assert(withFallback.chain.chainId === 42161, "Fallback router preserves chain ID");

try {
  createRouter(42161, []);
  assert(false, "createRouter rejects empty RPC fallback array");
} catch (err) {
  assert(err instanceof EmpxError, "Empty RPC fallback throws EmpxError");
  assert((err as EmpxError).code === ERROR_CODES.INVALID_INPUT, "Empty RPC fallback uses INVALID_INPUT");
}

// Batch routers
const batch = createRouters([42161, 8453]);
assert(!!batch[42161], "createRouters returns Arbitrum router");
assert(!!batch[8453], "createRouters returns Base router");
assert(batch[42161].chain.chainId === 42161, "Batch Arbitrum chain ID");
assert(batch[8453].chain.chainId === 8453, "Batch Base chain ID");

const batchWithOverrides = createRouters([42161, 8453], {
  providers: {
    42161: [
      "https://arb-mainnet.g.alchemy.com/v2/test",
      "https://arb1.arbitrum.io/rpc",
    ],
  },
});
assert(batchWithOverrides[42161].provider instanceof ethers.FallbackProvider, "Batch override can use fallback provider");
assert(!(batchWithOverrides[8453].provider instanceof ethers.FallbackProvider), "Batch missing override uses chain default provider");

const batchWithDefault = createRouters([42161, 8453], {
  defaultProvider: [
    "https://rpc.example/primary",
    "https://rpc.example/fallback",
  ],
});
assert(batchWithDefault[42161].provider instanceof ethers.FallbackProvider, "Batch defaultProvider applies to Arbitrum");
assert(batchWithDefault[8453].provider instanceof ethers.FallbackProvider, "Batch defaultProvider applies to Base");

try {
  createRouters([]);
  assert(false, "createRouters rejects empty chain list");
} catch (err) {
  assert(err instanceof EmpxError, "Empty batch throws EmpxError");
  assert((err as EmpxError).code === ERROR_CODES.INVALID_INPUT, "Empty batch uses INVALID_INPUT");
}

try {
  createRouters([42161, 42161]);
  assert(false, "createRouters rejects duplicate chain IDs");
} catch (err) {
  assert(err instanceof EmpxError, "Duplicate batch throws EmpxError");
  assert((err as EmpxError).code === ERROR_CODES.INVALID_INPUT, "Duplicate batch uses INVALID_INPUT");
}

try {
  createRouters([42161], { providers: { 8453: "https://mainnet.base.org" } });
  assert(false, "createRouters rejects provider overrides outside requested chains");
} catch (err) {
  assert(err instanceof EmpxError, "Unused provider override throws EmpxError");
  assert((err as EmpxError).code === ERROR_CODES.INVALID_INPUT, "Unused provider override uses INVALID_INPUT");
}

const allRouters = getAllChainRouters();
assert(Object.keys(allRouters).length === chainIds.length, "getAllChainRouters returns all supported chains");
assert(!!allRouters[CHAIN_IDS.ARBITRUM], "getAllChainRouters includes Arbitrum");
assert(!!allRouters[CHAIN_IDS.BASE], "getAllChainRouters includes Base");

// ─── Agent schemas ──────────────────────────────────────────────────────────

console.log("\n─── Agent schemas ───");

assert(!!TOOL_SCHEMAS.createRouters, "TOOL_SCHEMAS includes createRouters");
assert(!!TOOL_SCHEMAS.getAllChainRouters, "TOOL_SCHEMAS includes getAllChainRouters");
assert(
  Array.isArray((TOOL_SCHEMAS.createRouters.inputSchema as any).required)
    && (TOOL_SCHEMAS.createRouters.inputSchema as any).required.includes("chainIds"),
  "createRouters schema requires chainIds"
);

const openAiTools = getOpenAITools();
assert(openAiTools.some((tool) => tool.function.name === "createRouters"), "OpenAI tools include createRouters");
assert(openAiTools.some((tool) => tool.function.name === "getAllChainRouters"), "OpenAI tools include getAllChainRouters");

// ─── ABIs ────────────────────────────────────────────────────────────────────

console.log("\n─── ABIs ───");

assert(Array.isArray(BASE_ROUTER_ABI), "BASE_ROUTER_ABI is array");
assert(Array.isArray(PLS_ROUTER_ABI), "PLS_ROUTER_ABI is array");
assert(Array.isArray(ETH_ROUTER_ABI), "ETH_ROUTER_ABI is array");
assert(Array.isArray(BASE_INTEGRATOR_ROUTER_ABI), "BASE_INTEGRATOR_ROUTER_ABI is array");
assert(Array.isArray(PLS_INTEGRATOR_ROUTER_ABI), "PLS_INTEGRATOR_ROUTER_ABI is array");
assert(Array.isArray(ETH_INTEGRATOR_ROUTER_ABI), "ETH_INTEGRATOR_ROUTER_ABI is array");
assert(Array.isArray(ERC20_ABI), "ERC20_ABI is array");
assert(BASE_ROUTER_ABI.length > 10, "BASE_ROUTER_ABI has 10+ entries");
assert(BASE_INTEGRATOR_ROUTER_ABI.length === BASE_ROUTER_ABI.length, "Integrator ABI same length as base");

// ─── Fee management ──────────────────────────────────────────────────────────

console.log("\n─── Fee management ───");

const defaultFee = getProtocolFeeBps();
assert(typeof defaultFee === "string", "getProtocolFeeBps returns string");
assert(defaultFee !== "0", "Default fee is non-zero");

setProtocolFeeBps(30);
assert(getProtocolFeeBps() === "30", "setProtocolFeeBps works");
setProtocolFeeBps(28);
assert(getProtocolFeeBps() === "28", "Reset protocol fee works");

// ─── Pair-type fees ──────────────────────────────────────────────────────────

console.log("\n─── Pair-type fees ───");

assert(isPairTypeFeesEnabled() === false, "Pair-type fees start disabled");
enablePairTypeFees();
assert(isPairTypeFeesEnabled() === true, "enablePairTypeFees activates");
disablePairTypeFees();
assert(isPairTypeFeesEnabled() === false, "disablePairTypeFees deactivates");

// ─── Affiliate tiers ─────────────────────────────────────────────────────────

console.log("\n─── Affiliate tiers ───");

assert(AFFILIATE_TIER_BPS.STANDARD === 1000, "STANDARD tier = 1000 bps");
assert(AFFILIATE_TIER_BPS.VOLUME_COMMITTED === 2500, "VOLUME_COMMITTED = 2500 bps");
assert(AFFILIATE_TIER_BPS.STRATEGIC === 5000, "STRATEGIC = 5000 bps");

const stdConfig = makeAffiliateConfig({ address: "0x" + "aa".repeat(20), tier: "STANDARD" });
assert(stdConfig.feeBps === 1000, "makeAffiliateConfig STANDARD feeBps");

try { makeAffiliateConfig({ address: "bad", tier: "STANDARD" }); assert(false, "Should reject bad address"); }
catch { assert(true, "Rejects bad address"); }

assert(classifyAffiliateTier({ address: "0x" + "bb".repeat(20), feeBps: 1000 }) === "STANDARD", "classifyAffiliateTier STANDARD");
assert(classifyAffiliateTier({ address: "0x" + "cc".repeat(20), feeBps: 5000 }) === "STRATEGIC", "classifyAffiliateTier STRATEGIC");
assert(classifyAffiliateTier({ address: "0x" + "dd".repeat(20), feeBps: 1234 }) === null, "classifyAffiliateTier returns null for custom");

// ─── Validators ──────────────────────────────────────────────────────────────

console.log("\n─── Validators ───");

assert(isValidAddress("0x" + "12".repeat(20)), "isValidAddress returns true");
assert(!isValidAddress("0xGG"), "isValidAddress rejects bad hex");
assert(isPositiveBigInt("100"), "isPositiveBigInt returns true for 100");
assert(!isPositiveBigInt("0"), "isPositiveBigInt returns false for 0");

// ─── Errors ──────────────────────────────────────────────────────────────────

console.log("\n─── Errors ───");

const err = new EmpxError(ERROR_CODES.INVALID_INPUT, "test message", true, { key: "val" });
assert(err instanceof Error, "EmpxError extends Error");
assert(err.name === "EmpxError", "Error name");
assert(err.code === ERROR_CODES.INVALID_INPUT, "Error code");
assert(err.retryable === true, "Error retryable");
assert(err.context.key === "val", "Error context");

const json = err.toJSON();
assert(json.error.code === "INVALID_INPUT", "toJSON code");
assert(json.error.retryable === true, "toJSON retryable");

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`${"─".repeat(60)}`);

if (errors.length > 0) {
  console.error("\nFailures:");
  for (const e of errors) console.error(`  ${e}`);
}

if (failed > 0) process.exit(1);
