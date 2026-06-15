// ─── Split Calldata Builder ───────────────────────────────────────────────────
//
// Encodes an EmpsealMulticallRouter.multiSwap([...]) call from a SplitResult
// produced by the solver.  The on-chain multicall router takes N legs and
// executes them atomically; reverts the whole batch if any leg fails.
//
// Contract reference (empx-cross-bridge/src/contracts/plugins/EmpsealMulticallRouter.sol):
//
//   enum Kind { ERC20_TO_ERC20, NATIVE_TO_ERC20, ERC20_TO_NATIVE }
//
//   struct Trade {
//     uint256   amountIn;
//     uint256   amountOut;    // minimum out (slippage)
//     address[] path;
//     address[] adapters;
//   }
//
//   struct MulticallLeg {
//     Kind kind;              // 0, 1, or 2
//     Trade trade;
//     address recipient;
//     uint256 fee;            // basis points
//     uint256 nativeValue;    // NATIVE_TO_ERC20 only; 0 otherwise
//   }
//
//   function multiSwap(MulticallLeg[] calldata legs) external payable
//
// Important on msg.value:
//   For NATIVE_TO_ERC20 legs, the leg's `nativeValue` is the portion of
//   msg.value consumed by that leg.  The total msg.value of the multiSwap
//   transaction MUST equal the sum of nativeValue across NATIVE_TO_ERC20
//   legs (the on-chain check is `NativeValueMismatch(sent, required)`).
//   This module computes both for the caller.

import { ethers } from "ethers";
import type { ChainConfig, CalldataResult, TradeInfo } from "../types.js";
import type { SplitResult } from "./splitSolver.js";

// ─── ABI fragment ─────────────────────────────────────────────────────────────
//
// Defined inline (not in abi_data.json) because:
//   • The multicall router is a NEW contract; the original SDK ABI JSON
//     captures the existing on-chain router only.
//   • Inlining the fragment keeps the multicall ABI versioned with the
//     calldata encoder that consumes it — drift between them is impossible.

const MULTICALL_ROUTER_ABI = [
  {
    type: "function",
    name: "multiSwap",
    stateMutability: "payable",
    inputs: [
      {
        name: "legs", type: "tuple[]",
        components: [
          { name: "kind", type: "uint8" },
          {
            name: "trade", type: "tuple",
            components: [
              { name: "amountIn",  type: "uint256" },
              { name: "amountOut", type: "uint256" },
              { name: "path",      type: "address[]" },
              { name: "adapters",  type: "address[]" },
            ],
          },
          { name: "recipient",   type: "address" },
          { name: "fee",         type: "uint256" },
          { name: "nativeValue", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
];

// Kind enum values must match Solidity contract exactly.
export const SwapKind = {
  ERC20_TO_ERC20:    0,
  NATIVE_TO_ERC20:   1,
  ERC20_TO_NATIVE:   2,
} as const;
export type SwapKindValue = (typeof SwapKind)[keyof typeof SwapKind];

// ─── Per-leg trade info shape ─────────────────────────────────────────────────
//
// Caller derives one of these per leg from the solver's SplitResult.legs[].
// Slippage application + Kind decision is the caller's responsibility; this
// module encodes mechanically.

export interface SplitLegTrade {
  /** Bottom-of-the-pool floor — the leg reverts when actual out < this. */
  minAmountOut: string;
  /** Per-leg path + adapters as returned by findBestPath at the leg's amount. */
  path: string[];
  adapters: string[];
}

export interface BuildSplitCalldataInput {
  /** Chain config — must have MULTICALL_ROUTER_ADDRESS populated.
   *  When undefined this function throws SPLIT_UNAVAILABLE. */
  chainConfig: ChainConfig;
  /** Where the OUTPUT tokens land.  Must be the same for all legs. */
  recipient: string;
  /** Protocol fee in basis points (mirrored on every leg — passed through
   *  to the underlying EmpsealRouter via Trade struct). */
  feeBps: number | bigint | string;
  /** Per-leg: amountIn, minAmountOut, path, adapters. */
  legs: Array<{
    amountIn: string | bigint;
    minAmountOut: string | bigint;
    path: string[];
    adapters: string[];
    /** Kind: 0=ERC20→ERC20, 1=NATIVE→ERC20, 2=ERC20→NATIVE.
     *  All legs in one multicall must agree on (native?, native?) tuple
     *  for sanity — the SDK helper sets this uniformly from the swap's
     *  outer tokenIn/tokenOut. */
    kind: SwapKindValue;
  }>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SplitCalldataError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "SplitCalldataError";
  }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Encodes EmpsealMulticallRouter.multiSwap([...legs]).
 *
 * Returns `{ to, data, value }`:
 *   • `to`    — the chain's multicall router (NOT the EmpsealRouter)
 *   • `data`  — multiSwap calldata
 *   • `value` — sum of nativeValue across NATIVE_TO_ERC20 legs (as a
 *               decimal string in wei).  Caller attaches as msg.value.
 *
 * Throws:
 *   SPLIT_UNAVAILABLE — chainConfig.MULTICALL_ROUTER_ADDRESS unset
 *   INVALID_LEGS      — 0 legs, > 10 legs, or malformed leg
 *   MIXED_KINDS       — legs disagree on Kind in a way the on-chain
 *                       router doesn't support (each kind is a different
 *                       output-token type; mixing breaks aggregation)
 */
export function buildSplitMultiSwapCalldata(
  input: BuildSplitCalldataInput,
): CalldataResult {
  const { chainConfig, recipient, feeBps, legs } = input;

  if (!chainConfig.MULTICALL_ROUTER_ADDRESS) {
    throw new SplitCalldataError(
      "SPLIT_UNAVAILABLE",
      `Split routing not available on ${chainConfig.name} (chainId ${chainConfig.chainId}) — `
      + `MULTICALL_ROUTER_ADDRESS not configured.  Use the single-route flow instead.`,
    );
  }
  if (!ethers.isAddress(recipient)) {
    throw new SplitCalldataError("INVALID_LEGS", `recipient is not a valid address: ${recipient}`);
  }
  if (legs.length === 0) {
    throw new SplitCalldataError("INVALID_LEGS", "at least one leg required");
  }
  if (legs.length > 10) {
    // Mirrors on-chain MAX_LEGS_PER_BATCH = 10.
    throw new SplitCalldataError("INVALID_LEGS", `too many legs: ${legs.length} (max 10)`);
  }

  // All legs must share the same Kind — the on-chain router enforces
  // tokenIn-uniformity (per the approval logic in the contract).
  const firstKind = legs[0].kind;
  for (let i = 1; i < legs.length; i++) {
    if (legs[i].kind !== firstKind) {
      throw new SplitCalldataError(
        "MIXED_KINDS",
        `all legs must share the same Kind; got mixed (leg 0=${firstKind} vs leg ${i}=${legs[i].kind})`,
      );
    }
  }

  // Build the legs array as the ABI encoder expects (ethers v6 tuple format).
  let totalNativeValue: bigint = BigInt(0);
  const encodedLegs = legs.map((leg, i) => {
    const amountIn  = BigInt(leg.amountIn);
    const minOut    = BigInt(leg.minAmountOut);
    if (amountIn <= BigInt(0)) {
      throw new SplitCalldataError("INVALID_LEGS", `leg ${i}: amountIn must be positive`);
    }
    if (!Array.isArray(leg.path) || leg.path.length < 2) {
      throw new SplitCalldataError("INVALID_LEGS", `leg ${i}: path must have >= 2 tokens`);
    }
    if (!Array.isArray(leg.adapters) || leg.adapters.length !== leg.path.length - 1) {
      throw new SplitCalldataError(
        "INVALID_LEGS",
        `leg ${i}: adapters.length (${leg.adapters.length}) must equal path.length - 1 (${leg.path.length - 1})`,
      );
    }

    // For NATIVE_TO_ERC20, nativeValue is the leg's input amount (the
    // caller pre-wraps it inside msg.value).  For other kinds, 0.
    const nativeValue = (leg.kind === SwapKind.NATIVE_TO_ERC20) ? amountIn : BigInt(0);
    totalNativeValue += nativeValue;

    return {
      kind: leg.kind,
      trade: {
        amountIn,
        amountOut: minOut,
        path:      leg.path,
        adapters:  leg.adapters,
      },
      recipient,
      fee: BigInt(feeBps),
      nativeValue,
    };
  });

  const iface = new ethers.Interface(MULTICALL_ROUTER_ABI as ethers.InterfaceAbi);
  const data  = iface.encodeFunctionData("multiSwap", [encodedLegs]);

  return {
    to:    chainConfig.MULTICALL_ROUTER_ADDRESS,
    data,
    value: totalNativeValue.toString(),
  };
}

// ─── Helper: derive Kind from native-in / native-out flags ────────────────────

export function pickSwapKind(isNativeIn: boolean, isNativeOut: boolean): SwapKindValue {
  if (isNativeIn  && !isNativeOut) return SwapKind.NATIVE_TO_ERC20;
  if (!isNativeIn &&  isNativeOut) return SwapKind.ERC20_TO_NATIVE;
  return SwapKind.ERC20_TO_ERC20;
}

// ─── Helper: build a single TradeInfo aggregating a split for back-compat ─────
//
// Some callers (UI quote preview, accounting) want a top-level TradeInfo
// shape that aggregates the split — total amountIn, total minAmountOut,
// the dominant path for display purposes.  This builds it from a
// SplitResult so callers can keep their existing TradeInfo-shaped code
// while still rendering the per-leg breakdown from split.legs[].

export function buildSplitAggregateTradeInfo(
  split: SplitResult,
  feeBps: string | number | bigint,
  totalAmountIn: string | bigint,
  sdkVersion: string,
  quoteTtlMs = 30_000,
): TradeInfo {
  if (split.legs.length === 0) {
    throw new SplitCalldataError("INVALID_LEGS", "SplitResult has no legs");
  }

  // Sum minAmountOut across legs — caller can apply slippage upstream.
  let totalMinOut: bigint = BigInt(0);
  for (const leg of split.legs) totalMinOut += BigInt(leg.expectedOut);

  // The "path" field in the aggregate is the LARGEST leg's path — used
  // for UI display only.  Callers needing per-leg detail read split.legs[].
  const dominantLeg = split.legs.reduce(
    (best, leg) => (BigInt(leg.amountIn) > BigInt(best.amountIn) ? leg : best),
    split.legs[0],
  );

  const now = Date.now();
  return {
    amountIn:     totalAmountIn.toString(),
    amountOut:    totalMinOut.toString(),
    fee:          feeBps.toString(),
    affiliateFee: "0",
    totalFeeBps:  feeBps.toString(),
    amounts:      dominantLeg.path.amounts,
    path:         dominantLeg.path.path,
    adapters:     dominantLeg.path.adapters,
    gasEstimate:  split.gasEstimateWei,
    quoteId:      typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${now}-${Math.random().toString(36).slice(2)}`,
    timestamp:    now,
    validUntil:   now + quoteTtlMs,
    sdkVersion,
  };
}
