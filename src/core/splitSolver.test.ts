// ─── splitSolver — unit tests ─────────────────────────────────────────────────
//
// Self-contained: stubs findBestPath so no RPC is needed.  Run with:
//   npx tsx src/core/splitSolver.test.ts
//
// Exits non-zero on any failure.  Keeps assertions explicit (no test
// framework dependency) so this file works in any CI/local setup.

import type { ChainConfig, PathResult } from "../types.js";
import { findBestSplitRouting, _internals } from "./splitSolver.js";

// ─── Test harness ─────────────────────────────────────────────────────────────

let testsRun = 0;
let testsPassed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  testsRun++;
  const onErr = (err: unknown) => {
    failures.push(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => { testsPassed++; }).catch(onErr);
    } else {
      testsPassed++;
    }
  } catch (err) { onErr(err); }
}

function asyncTest(name: string, fn: () => Promise<void>): Promise<void> {
  testsRun++;
  return fn().then(
    () => { testsPassed++; },
    (err) => { failures.push(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`); },
  );
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

function assertBigIntEqual(actual: bigint, expected: bigint, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}\n      expected: ${expected.toString()}\n      actual:   ${actual.toString()}`);
  }
}

// ─── Tests on pure helpers ────────────────────────────────────────────────────

test("divideByBps: 50/50 of 1000 → [500, 500]", () => {
  const out = _internals.divideByBps(BigInt(1000), [5000, 5000]);
  assertBigIntEqual(out[0], BigInt(500), "first leg");
  assertBigIntEqual(out[1], BigInt(500), "second leg");
});

test("divideByBps: 60/40 of 1000 → [600, 400]", () => {
  const out = _internals.divideByBps(BigInt(1000), [6000, 4000]);
  assertBigIntEqual(out[0], BigInt(600), "first leg");
  assertBigIntEqual(out[1], BigInt(400), "second leg");
});

test("divideByBps: 33.34/33.33/33.33 of 100 → dust goes to LAST leg", () => {
  const out = _internals.divideByBps(BigInt(100), [3334, 3333, 3333]);
  // 100 × 3334/10000 = 33; 100 × 3333/10000 = 33; remaining = 100-33-33 = 34
  assertBigIntEqual(out[0], BigInt(33), "first leg");
  assertBigIntEqual(out[1], BigInt(33), "second leg");
  assertBigIntEqual(out[2], BigInt(34), "last leg gets dust");
});

test("divideByBps: 7/3 of 1 → [0, 1] (smallest amount, dust to last)", () => {
  const out = _internals.divideByBps(BigInt(1), [7000, 3000]);
  // 1 × 7000/10000 = 0 (truncated); remaining = 1
  assertBigIntEqual(out[0], BigInt(0), "first leg truncates to 0");
  assertBigIntEqual(out[1], BigInt(1), "last leg gets the rest");
});

test("divideByBps: sum invariant — sum(legs) === amount always", () => {
  const cases: Array<{ amount: bigint; bps: number[] }> = [
    { amount: BigInt(1_000_000_000),     bps: [5000, 5000] },
    { amount: BigInt("999999999999"),     bps: [6000, 4000] },
    { amount: BigInt(7),                  bps: [3334, 3333, 3333] },
    { amount: BigInt("12345678987654321"), bps: [2500, 2500, 2500, 2500] },
  ];
  for (const c of cases) {
    const out = _internals.divideByBps(c.amount, c.bps);
    const sum = out.reduce((a, b) => a + b, BigInt(0));
    assertBigIntEqual(sum, c.amount, `sum=${sum} != amount=${c.amount} for ${c.bps.join("/")}`);
  }
});

test("bpsImprovement: 1.01x → 100 bps (1%)", () => {
  const bps = _internals.bpsImprovement(BigInt(101), BigInt(100));
  assertEqual(bps, 100, "1% improvement → 100 bps");
});

test("bpsImprovement: identical → 0 bps", () => {
  const bps = _internals.bpsImprovement(BigInt(100), BigInt(100));
  assertEqual(bps, 0, "no change → 0 bps");
});

test("bpsImprovement: zero single → 0 bps (safety)", () => {
  const bps = _internals.bpsImprovement(BigInt(100), BigInt(0));
  assertEqual(bps, 0, "zero baseline → 0 bps (no div-by-zero)");
});

test("candidatesUpTo(2) returns only 2-leg allocations", () => {
  const cands = _internals.candidatesUpTo(2);
  if (cands.length === 0) throw new Error("expected at least one candidate");
  for (const c of cands) {
    if (c.length !== 2) throw new Error(`candidate had ${c.length} legs, expected 2`);
    const sum = c.reduce((a, b) => a + b, 0);
    if (sum !== 10_000) throw new Error(`bps don't sum to 10000: ${c.join("+")}=${sum}`);
  }
});

test("candidatesUpTo(3) includes 2- and 3-leg allocations", () => {
  const cands = _internals.candidatesUpTo(3);
  const has2 = cands.some((c) => c.length === 2);
  const has3 = cands.some((c) => c.length === 3);
  if (!has2 || !has3) throw new Error("expected both 2- and 3-leg candidates");
});

test("all bundled allocations sum to exactly 10000 bps", () => {
  for (const c of [..._internals.ALLOCATIONS_2, ..._internals.ALLOCATIONS_3, ..._internals.ALLOCATIONS_4]) {
    const sum = c.reduce((a, b) => a + b, 0);
    if (sum !== 10_000) throw new Error(`bad allocation ${c.join("/")}=${sum}`);
  }
});

// ─── Tests on findBestSplitRouting via a stubbed findBestPath ─────────────────
//
// We can't stub findBestPath through normal imports cleanly without DI.  The
// solver IS pluggable via the chainConfig.routerAbi mechanism, but the
// pathfinder hits ethers.Contract.  For these tests we use a minimal
// "provider stub" that returns deterministic responses to the eth_call
// shape findBestPath sends.

import { ethers } from "ethers";

/** Stub Provider that returns pre-canned findBestPath results based on the
 *  decoded amountIn argument.  Lets us simulate "smaller amount → different
 *  path" behaviour for split-quality testing. */
class StubProvider {
  constructor(private readonly responses: Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>) {}

  // ethers.Provider surface — only the methods findBestPath actually calls.
  async call(tx: { to: string; data: string }): Promise<string> {
    // Decode the amountIn from the call data.  findBestPath function selector
    // is the first 4 bytes; we skip and extract uint256 amountIn at offset 4.
    const amountIn = "0x" + tx.data.slice(10, 74);
    const key = BigInt(amountIn).toString();
    const r = this.responses.get(key);
    if (!r) throw new Error(`StubProvider has no response for amountIn=${key}`);
    // Encode as the on-chain findBestPath return shape:
    //   (uint256[] amounts, address[] path, address[] adapters, uint256 gasEstimate)
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return coder.encode(
      ["uint256[]", "address[]", "address[]", "uint256"],
      [
        [amountIn, r.amountOut],
        r.path,
        new Array(r.path.length - 1).fill("0x" + "11".repeat(20)),
        r.gasEstimate,
      ],
    );
  }
  // Stubs for unused Provider surface — ethers.Contract needs these to construct.
  async getNetwork() { return { chainId: BigInt(1), name: "test" }; }
  async resolveName(name: string) { return name; }
  destroy() { /* no-op */ }
  async getBlockNumber() { return 1; }
}

const STUB_CHAIN_CONFIG: ChainConfig = {
  chainId: 1,
  name: "test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl: "stub",
  ROUTER_ADDRESS: "0x" + "ff".repeat(20),
  NATIVE_ADDRESS: "0x" + "ee".repeat(20),
  WRAPPED_NATIVE: "0x" + "cc".repeat(20),
  USD_STABLE: "0x" + "aa".repeat(20),
  USD_STABLE_DECIMALS: 6,
  STABLE_TOKENS: [],
  TRUSTED_TOKENS: [],
  ADAPTERS: [],
  nativeSwapFns: { fromNative: "swapNoSplitFromETH", toNative: "swapNoSplitToETH" },
  routerAbi: [{
    type: "function", name: "findBestPath", stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" }, { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" }, { name: "maxSteps", type: "uint256" },
    ],
    outputs: [
      { name: "amounts",     type: "uint256[]" }, { name: "path",        type: "address[]" },
      { name: "adapters",    type: "address[]" }, { name: "gasEstimate", type: "uint256" },
    ],
  }],
};

const TOKEN_IN  = "0x" + "01".repeat(20);
const TOKEN_OUT = "0x" + "02".repeat(20);

asyncTest("split picked when 60/40 beats single by > minSavingsBps", async () => {
  // Single quote for 1000 → 900 (10% slippage).
  // 60/40 split: leg 1 (600 → 555), leg 2 (400 → 365) → total 920 (8% slippage)
  // Improvement vs single: (920-900)/900 = 222 bps — comfortably above default 10
  const responses = new Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>([
    [BigInt(1000).toString(), { amountOut: BigInt(900), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(600).toString(),  { amountOut: BigInt(555), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(400).toString(),  { amountOut: BigInt(365), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    // Other candidates — provide weaker numbers to ensure 60/40 wins
    [BigInt(500).toString(),  { amountOut: BigInt(458), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(700).toString(),  { amountOut: BigInt(630), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(300).toString(),  { amountOut: BigInt(275), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(800).toString(),  { amountOut: BigInt(720), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(200).toString(),  { amountOut: BigInt(184), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
  ]);
  const provider = new StubProvider(responses) as unknown as ethers.Provider;
  const result = await findBestSplitRouting(provider, STUB_CHAIN_CONFIG, BigInt(1000), TOKEN_IN, TOKEN_OUT, 1, { maxSplits: 2 });

  if (result.routing !== "split") throw new Error(`expected split, got ${result.routing}`);
  if (BigInt(result.estimatedOut) < BigInt(901)) {
    throw new Error(`split out=${result.estimatedOut} should beat single 900`);
  }
  if (result.splitSavingsBps < 10) {
    throw new Error(`savingsBps=${result.splitSavingsBps} below floor`);
  }
  if (result.legs.length !== 2) throw new Error(`expected 2 legs, got ${result.legs.length}`);
});

asyncTest("single picked when splits provide negligible gain", async () => {
  // All splits return roughly same total — gain below minSavingsBps floor.
  const responses = new Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>([
    [BigInt(1000).toString(), { amountOut: BigInt(1000), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    // 50/50: 500 + 500 = 1000 → gain 0
    [BigInt(500).toString(),  { amountOut: BigInt(500),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(600).toString(),  { amountOut: BigInt(600),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(400).toString(),  { amountOut: BigInt(400),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(700).toString(),  { amountOut: BigInt(700),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(300).toString(),  { amountOut: BigInt(300),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(800).toString(),  { amountOut: BigInt(800),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(200).toString(),  { amountOut: BigInt(200),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
  ]);
  const provider = new StubProvider(responses) as unknown as ethers.Provider;
  const result = await findBestSplitRouting(provider, STUB_CHAIN_CONFIG, BigInt(1000), TOKEN_IN, TOKEN_OUT, 1, { maxSplits: 2 });

  if (result.routing !== "single") throw new Error(`expected single (no gain), got ${result.routing}`);
  if (result.legs.length !== 1) throw new Error(`expected 1 leg, got ${result.legs.length}`);
  if (result.splitSavingsBps !== 0) throw new Error("splitSavingsBps should be 0 for single result");
});

asyncTest("single also picked when split would lose (negative gain)", async () => {
  // Splits all produce LESS than single (price impact better at full size).
  const responses = new Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>([
    [BigInt(1000).toString(), { amountOut: BigInt(1000), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(500).toString(),  { amountOut: BigInt(450),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(600).toString(),  { amountOut: BigInt(540),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(400).toString(),  { amountOut: BigInt(360),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(700).toString(),  { amountOut: BigInt(630),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(300).toString(),  { amountOut: BigInt(270),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(800).toString(),  { amountOut: BigInt(720),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(200).toString(),  { amountOut: BigInt(180),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
  ]);
  const provider = new StubProvider(responses) as unknown as ethers.Provider;
  const result = await findBestSplitRouting(provider, STUB_CHAIN_CONFIG, BigInt(1000), TOKEN_IN, TOKEN_OUT, 1, { maxSplits: 2 });

  if (result.routing !== "single") throw new Error(`expected single (split worse), got ${result.routing}`);
});

asyncTest("solver picks BEST among multiple winning splits", async () => {
  // 50/50 gives total 1010 (+10 bps via slim margin).
  // 60/40 gives total 1050 (+555 bps — much better, should win).
  const responses = new Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>([
    [BigInt(1000).toString(), { amountOut: BigInt(1000), path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(500).toString(),  { amountOut: BigInt(505),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(600).toString(),  { amountOut: BigInt(620),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(400).toString(),  { amountOut: BigInt(430),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(700).toString(),  { amountOut: BigInt(700),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(300).toString(),  { amountOut: BigInt(300),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(800).toString(),  { amountOut: BigInt(800),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(200).toString(),  { amountOut: BigInt(200),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
  ]);
  const provider = new StubProvider(responses) as unknown as ethers.Provider;
  const result = await findBestSplitRouting(provider, STUB_CHAIN_CONFIG, BigInt(1000), TOKEN_IN, TOKEN_OUT, 1, { maxSplits: 2 });

  if (result.routing !== "split") throw new Error(`expected split, got ${result.routing}`);
  if (BigInt(result.estimatedOut) !== BigInt(1050)) {
    throw new Error(`expected 60/40 split with total=1050, got ${result.estimatedOut}`);
  }
  // Validate the legs reflect 60/40
  const sortedLegs = [...result.legs].sort((a, b) => Number(BigInt(b.amountIn) - BigInt(a.amountIn)));
  if (BigInt(sortedLegs[0].amountIn) !== BigInt(600)) {
    throw new Error(`expected biggest leg=600, got ${sortedLegs[0].amountIn}`);
  }
});

asyncTest("solver respects maxSplits cap (3 not picked when maxSplits=2)", async () => {
  // Provide responses such that 3-way would win if allowed; we cap to 2.
  const responses = new Map<string, { amountOut: bigint; path: string[]; gasEstimate: bigint }>([
    [BigInt(1000).toString(), { amountOut: BigInt(900),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(500).toString(),  { amountOut: BigInt(460),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(600).toString(),  { amountOut: BigInt(555),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(400).toString(),  { amountOut: BigInt(365),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(700).toString(),  { amountOut: BigInt(640),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(300).toString(),  { amountOut: BigInt(285),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(800).toString(),  { amountOut: BigInt(720),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
    [BigInt(200).toString(),  { amountOut: BigInt(190),  path: [TOKEN_IN, TOKEN_OUT], gasEstimate: BigInt(120_000) }],
  ]);
  const provider = new StubProvider(responses) as unknown as ethers.Provider;
  const result = await findBestSplitRouting(provider, STUB_CHAIN_CONFIG, BigInt(1000), TOKEN_IN, TOKEN_OUT, 1, { maxSplits: 2 });

  if (result.legs.length > 2) {
    throw new Error(`expected ≤2 legs (maxSplits=2), got ${result.legs.length}`);
  }
});

// ─── Wait for async tests then summarise ──────────────────────────────────────

setTimeout(() => {
  console.log(`\n─── splitSolver tests ──────────────────────────────────────────`);
  console.log(`Run:    ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsRun - testsPassed}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
  console.log("\nAll splitSolver tests passed.");
}, 100);
