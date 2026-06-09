// ─── feeTiers — pair-type unit tests ──────────────────────────────────────────
//
// Self-contained: no RPC, no DOM, no framework.  Run with:
//   npx tsx src/core/feeTiers.test.ts
//
// Exits non-zero on any failure.

import {
  enablePairTypeFees,
  disablePairTypeFees,
  isPairTypeFeesEnabled,
  getPairTypeConfig,
  resolveTieredFeeBps,
  classifyPair,
  isStableToken,
  DEFAULT_PAIR_TYPE_FEES,
  // Deprecated aliases still exported
  enableTieredFees,
  isTieredFeesEnabled,
} from "./feeTiers.js";
import { MIN_PROTOCOL_FEE_BPS } from "./fees.js";

let testsRun = 0;
let testsPassed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg = "") {
  if (actual !== expected) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}${msg ? ` — ${msg}` : ""}`);
  }
}

function assertThrows(fn: () => void, msgMatch?: string) {
  let threw = false;
  try {
    fn();
  } catch (e: any) {
    threw = true;
    if (msgMatch && !e.message.includes(msgMatch)) {
      throw new Error(`threw "${e.message}" but expected match "${msgMatch}"`);
    }
  }
  if (!threw) throw new Error("expected throw, none happened");
}

console.log("\nfeeTiers — pair-type unit tests\n");

disablePairTypeFees();

// ─── State management ────────────────────────────────────────────────────────

test("starts disabled", () => {
  assertEq(isPairTypeFeesEnabled(), false);
  assertEq(getPairTypeConfig(), null);
});

test("enablePairTypeFees() activates with defaults", () => {
  const cfg = enablePairTypeFees();
  assertEq(isPairTypeFeesEnabled(), true);
  assertEq(cfg.volatileVolatileBps, DEFAULT_PAIR_TYPE_FEES.volatileVolatileBps);
  assertEq(cfg.volatileStableBps, DEFAULT_PAIR_TYPE_FEES.volatileStableBps);
  assertEq(cfg.stableStableBps, DEFAULT_PAIR_TYPE_FEES.stableStableBps);
  disablePairTypeFees();
});

test("default rates match production fee structure", () => {
  assertEq(DEFAULT_PAIR_TYPE_FEES.volatileVolatileBps, 28);
  assertEq(DEFAULT_PAIR_TYPE_FEES.volatileStableBps, 15);
  assertEq(DEFAULT_PAIR_TYPE_FEES.stableStableBps, 9);
});

test("disablePairTypeFees() clears state", () => {
  enablePairTypeFees();
  disablePairTypeFees();
  assertEq(isPairTypeFeesEnabled(), false);
  assertEq(getPairTypeConfig(), null);
});

// ─── Stable detection from chain config ──────────────────────────────────────

const fakeChain = {
  STABLE_TOKENS: [
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // arb USDC
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // arb USDT
  ],
};

test("isStableToken — recognises stable address", () => {
  assertEq(isStableToken("0xaf88d065e77c8cc2239327c5edb3a432268e5831", fakeChain), true);
});

test("isStableToken — case-insensitive", () => {
  assertEq(isStableToken("0xAF88D065E77C8CC2239327C5EDB3A432268E5831", fakeChain), true);
});

test("isStableToken — rejects unknown address", () => {
  assertEq(isStableToken("0x1234567890123456789012345678901234567890", fakeChain), false);
});

test("isStableToken — handles missing STABLE_TOKENS", () => {
  assertEq(isStableToken("0xaf88...", {}), false);
});

// ─── Pair classification ─────────────────────────────────────────────────────

test("classifyPair — S→S returns S/S", () => {
  assertEq(classifyPair(true, true), "S/S");
});

test("classifyPair — V→S returns V/S", () => {
  assertEq(classifyPair(false, true), "V/S");
});

test("classifyPair — S→V returns V/S (order-independent)", () => {
  assertEq(classifyPair(true, false), "V/S");
});

test("classifyPair — V→V returns V/V", () => {
  assertEq(classifyPair(false, false), "V/V");
});

// ─── Graceful degradation when off ───────────────────────────────────────────

test("resolveTieredFeeBps returns null when disabled", () => {
  disablePairTypeFees();
  assertEq(resolveTieredFeeBps({ pairType: "V/V" }), null);
});

test("resolveTieredFeeBps returns null when no classification context", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({}), null);
  disablePairTypeFees();
});

// ─── Pair-type resolution — production rates ─────────────────────────────────

test("V/V pair → 28 bps", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({ pairType: "V/V" }), 28);
  assertEq(resolveTieredFeeBps({ tokenInIsStable: false, tokenOutIsStable: false }), 28);
  disablePairTypeFees();
});

test("V/S pair → 15 bps (either direction)", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({ pairType: "V/S" }), 15);
  assertEq(resolveTieredFeeBps({ tokenInIsStable: true, tokenOutIsStable: false }), 15);
  assertEq(resolveTieredFeeBps({ tokenInIsStable: false, tokenOutIsStable: true }), 15);
  disablePairTypeFees();
});

test("S/S pair → 9 bps (at router floor)", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({ pairType: "S/S" }), 9);
  assertEq(resolveTieredFeeBps({ tokenInIsStable: true, tokenOutIsStable: true }), 9);
  disablePairTypeFees();
});

// ─── Floor enforcement ───────────────────────────────────────────────────────

test("S/S floor enforced when custom config goes below router min", () => {
  // Should throw at config time — never silently let through
  assertThrows(
    () => enablePairTypeFees({ stableStableBps: 5 }),
    "below router min"
  );
});

test("explicit S/S override works at floor (9 bps)", () => {
  enablePairTypeFees({ stableStableBps: Number(MIN_PROTOCOL_FEE_BPS) });
  assertEq(resolveTieredFeeBps({ pairType: "S/S" }), 9);
  disablePairTypeFees();
});

// ─── Legacy isStablePair compatibility ───────────────────────────────────────

test("legacy isStablePair=true maps to S/S", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({ isStablePair: true }), 9);
  disablePairTypeFees();
});

test("legacy isStablePair=false maps to V/V", () => {
  enablePairTypeFees();
  assertEq(resolveTieredFeeBps({ isStablePair: false }), 28);
  disablePairTypeFees();
});

// ─── Deprecated API alias still works ────────────────────────────────────────

test("deprecated enableTieredFees() activates pair-type mode", () => {
  enableTieredFees();
  assertEq(isTieredFeesEnabled(), true);
  assertEq(isPairTypeFeesEnabled(), true);
  assertEq(resolveTieredFeeBps({ pairType: "V/V" }), 28);
  disablePairTypeFees();
});

// ─── End-to-end auto-classification simulation ───────────────────────────────
//
// Simulates what the router does internally: take chainConfig + tokenIn +
// tokenOut, auto-derive isStable flags, classify pair, resolve fee.

test("E2E: ETH→USDC on arbitrum auto-classifies as V/S → 15 bps", () => {
  enablePairTypeFees();
  const tokenIn = "0x0000000000000000000000000000000000000000";  // native ETH
  const tokenOut = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"; // USDC arb
  const ctx = {
    tokenInIsStable: isStableToken(tokenIn, fakeChain),
    tokenOutIsStable: isStableToken(tokenOut, fakeChain),
  };
  assertEq(resolveTieredFeeBps(ctx), 15);
  disablePairTypeFees();
});

test("E2E: USDC→USDT on arbitrum auto-classifies as S/S → 9 bps", () => {
  enablePairTypeFees();
  const tokenIn = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";  // USDC arb
  const tokenOut = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"; // USDT arb
  const ctx = {
    tokenInIsStable: isStableToken(tokenIn, fakeChain),
    tokenOutIsStable: isStableToken(tokenOut, fakeChain),
  };
  assertEq(resolveTieredFeeBps(ctx), 9);
  disablePairTypeFees();
});

test("E2E: ETH→ARB (no stables) classifies as V/V → 28 bps", () => {
  enablePairTypeFees();
  const tokenIn = "0x0000000000000000000000000000000000000000";  // native ETH
  const tokenOut = "0x912ce59144191c1204e64559fe8253a0e49e6548"; // ARB token
  const ctx = {
    tokenInIsStable: isStableToken(tokenIn, fakeChain),
    tokenOutIsStable: isStableToken(tokenOut, fakeChain),
  };
  assertEq(resolveTieredFeeBps(ctx), 28);
  disablePairTypeFees();
});

// ─── Validation ──────────────────────────────────────────────────────────────

test("rejects fee > 10000 bps", () => {
  assertThrows(
    () => enablePairTypeFees({ volatileVolatileBps: 15000 }),
    "exceeds 100%"
  );
});

test("rejects non-finite fee", () => {
  assertThrows(
    () => enablePairTypeFees({ volatileVolatileBps: NaN }),
    "finite"
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed}/${testsRun} tests passed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
