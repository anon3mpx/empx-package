// ─── splitCalldata — unit tests ───────────────────────────────────────────────
//
// Self-contained.  Run with:
//   npx tsx src/core/splitCalldata.test.ts
//
// Exits non-zero on any failure.

import { ethers } from "ethers";
import type { ChainConfig } from "../types.js";
import {
  buildSplitMultiSwapCalldata,
  pickSwapKind,
  SwapKind,
  SplitCalldataError,
} from "./splitCalldata.js";

// ─── Test harness ─────────────────────────────────────────────────────────────

let testsRun = 0;
let testsPassed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); testsPassed++; }
  catch (err) { failures.push(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`); }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CHAIN_WITH_MC: ChainConfig = {
  chainId: 8453,
  name: "base-with-multicall",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrl: "stub",
  ROUTER_ADDRESS:          "0xB12b7C117434B58B7623f994F4D0b4af7BC0Ac37",
  NATIVE_ADDRESS:          "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  WRAPPED_NATIVE:          "0x4200000000000000000000000000000000000006",
  USD_STABLE:              "0x" + "aa".repeat(20),
  USD_STABLE_DECIMALS:     6,
  STABLE_TOKENS:           [],
  TRUSTED_TOKENS:          [],
  ADAPTERS:                [],
  nativeSwapFns:           { fromNative: "swapNoSplitFromETH", toNative: "swapNoSplitToETH" },
  MULTICALL_ROUTER_ADDRESS: ethers.getAddress("0x" + "1c".repeat(20)),  // valid placeholder
  routerAbi: [],
};

const CHAIN_NO_MC: ChainConfig = { ...CHAIN_WITH_MC, MULTICALL_ROUTER_ADDRESS: undefined };

const TOKEN_A = "0x" + "01".repeat(20);
const TOKEN_B = "0x" + "02".repeat(20);
const ADAPTER = "0x" + "11".repeat(20);
const RECIPIENT = ethers.getAddress("0x" + "ab".repeat(20));

// ─── Tests ────────────────────────────────────────────────────────────────────

test("pickSwapKind: native-in only → NATIVE_TO_ERC20", () => {
  assertEqual(pickSwapKind(true, false), SwapKind.NATIVE_TO_ERC20, "native-in flag");
});
test("pickSwapKind: native-out only → ERC20_TO_NATIVE", () => {
  assertEqual(pickSwapKind(false, true), SwapKind.ERC20_TO_NATIVE, "native-out flag");
});
test("pickSwapKind: neither native → ERC20_TO_ERC20", () => {
  assertEqual(pickSwapKind(false, false), SwapKind.ERC20_TO_ERC20, "no native");
});

test("throws SPLIT_UNAVAILABLE when multicall router not set", () => {
  try {
    buildSplitMultiSwapCalldata({
      chainConfig: CHAIN_NO_MC,
      recipient: RECIPIENT,
      feeBps: 28,
      legs: [{ amountIn: "100", minAmountOut: "90", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 }],
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof SplitCalldataError)) throw new Error("expected SplitCalldataError");
    assertEqual(err.code, "SPLIT_UNAVAILABLE", "error code");
  }
});

test("throws INVALID_LEGS on empty legs", () => {
  try {
    buildSplitMultiSwapCalldata({
      chainConfig: CHAIN_WITH_MC,
      recipient: RECIPIENT,
      feeBps: 28,
      legs: [],
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof SplitCalldataError)) throw new Error("expected SplitCalldataError");
    assertEqual(err.code, "INVALID_LEGS", "error code");
  }
});

test("throws INVALID_LEGS on adapter/path length mismatch", () => {
  try {
    buildSplitMultiSwapCalldata({
      chainConfig: CHAIN_WITH_MC,
      recipient: RECIPIENT,
      feeBps: 28,
      legs: [{
        amountIn: "100",
        minAmountOut: "90",
        path: [TOKEN_A, TOKEN_B, TOKEN_A],  // 3 tokens → expect 2 adapters
        adapters: [ADAPTER],                 // only 1
        kind: SwapKind.ERC20_TO_ERC20,
      }],
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof SplitCalldataError)) throw new Error("expected SplitCalldataError");
    assertEqual(err.code, "INVALID_LEGS", "error code");
  }
});

test("throws MIXED_KINDS when legs disagree on Kind", () => {
  try {
    buildSplitMultiSwapCalldata({
      chainConfig: CHAIN_WITH_MC,
      recipient: RECIPIENT,
      feeBps: 28,
      legs: [
        { amountIn: "100", minAmountOut: "90", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 },
        { amountIn: "200", minAmountOut: "180", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.NATIVE_TO_ERC20 },
      ],
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof SplitCalldataError)) throw new Error("expected SplitCalldataError");
    assertEqual(err.code, "MIXED_KINDS", "error code");
  }
});

test("ERC20_TO_ERC20 split: value === 0", () => {
  const result = buildSplitMultiSwapCalldata({
    chainConfig: CHAIN_WITH_MC,
    recipient: RECIPIENT,
    feeBps: 28,
    legs: [
      { amountIn: "600", minAmountOut: "555", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 },
      { amountIn: "400", minAmountOut: "365", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 },
    ],
  });
  assertEqual(result.value, "0", "non-native split should send no msg.value");
  assertEqual(result.to, CHAIN_WITH_MC.MULTICALL_ROUTER_ADDRESS!, "calldata targets multicall router");
  if (!result.data.startsWith("0x")) throw new Error("data not hex");
});

test("NATIVE_TO_ERC20 split: value === sum of leg amountIns", () => {
  const result = buildSplitMultiSwapCalldata({
    chainConfig: CHAIN_WITH_MC,
    recipient: RECIPIENT,
    feeBps: 28,
    legs: [
      { amountIn: "600", minAmountOut: "555", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.NATIVE_TO_ERC20 },
      { amountIn: "400", minAmountOut: "365", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.NATIVE_TO_ERC20 },
    ],
  });
  assertEqual(result.value, "1000", "native-input split: value=sum(amountIn)");
});

test("ERC20_TO_NATIVE split: value === 0 (output is native, not input)", () => {
  const result = buildSplitMultiSwapCalldata({
    chainConfig: CHAIN_WITH_MC,
    recipient: RECIPIENT,
    feeBps: 28,
    legs: [
      { amountIn: "600", minAmountOut: "555", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_NATIVE },
      { amountIn: "400", minAmountOut: "365", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_NATIVE },
    ],
  });
  assertEqual(result.value, "0", "native-OUTPUT split: input is ERC20, no msg.value");
});

test("encoded calldata round-trips via Interface.decodeFunctionData", () => {
  const result = buildSplitMultiSwapCalldata({
    chainConfig: CHAIN_WITH_MC,
    recipient: RECIPIENT,
    feeBps: 28,
    legs: [
      { amountIn: "600", minAmountOut: "555", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 },
      { amountIn: "400", minAmountOut: "365", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER], kind: SwapKind.ERC20_TO_ERC20 },
    ],
  });

  // Decode using the SAME ABI fragment shape — proves the encoder produces
  // valid ABI calldata.  Caller decoding catches schema drift.
  const iface = new ethers.Interface([
    "function multiSwap((uint8 kind,(uint256 amountIn,uint256 amountOut,address[] path,address[] adapters) trade,address recipient,uint256 fee,uint256 nativeValue)[] legs) payable",
  ]);
  const decoded = iface.decodeFunctionData("multiSwap", result.data);
  const legs = decoded[0] as unknown as Array<{ trade: { amountIn: bigint } }>;
  if (legs.length !== 2) throw new Error(`expected 2 legs, got ${legs.length}`);
  if (legs[0].trade.amountIn !== BigInt(600)) {
    throw new Error(`leg 0 amountIn mismatch: ${legs[0].trade.amountIn}`);
  }
  if (legs[1].trade.amountIn !== BigInt(400)) {
    throw new Error(`leg 1 amountIn mismatch: ${legs[1].trade.amountIn}`);
  }
});

test("throws INVALID_LEGS on > 10 legs", () => {
  const oneLeg = {
    amountIn: "100", minAmountOut: "90", path: [TOKEN_A, TOKEN_B], adapters: [ADAPTER],
    kind: SwapKind.ERC20_TO_ERC20,
  };
  try {
    buildSplitMultiSwapCalldata({
      chainConfig: CHAIN_WITH_MC,
      recipient: RECIPIENT,
      feeBps: 28,
      legs: Array(11).fill(oneLeg),
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof SplitCalldataError)) throw new Error("expected SplitCalldataError");
    assertEqual(err.code, "INVALID_LEGS", "error code");
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n─── splitCalldata tests ────────────────────────────────────────`);
console.log(`Run:    ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsRun - testsPassed}`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("\nAll splitCalldata tests passed.");
