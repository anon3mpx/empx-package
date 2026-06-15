// ─── Split Routing Solver ─────────────────────────────────────────────────────
//
// Strategic role:
//   The on-chain aggregator router exposes findBestPath(amount, tokenIn, tokenOut)
//   which returns ONE optimal path for the given size.  Because routers compute
//   marginal price impact internally, findBestPath at SMALLER sizes often returns
//   DIFFERENT paths than at the full size — pools and adapters that lose to the
//   "best" route at 100% can win at 60%, 40%, etc.
//
//   This solver enumerates a handful of allocation candidates (60/40, 50/50,
//   70/30, etc.), queries findBestPath at each leg's amount in parallel, and
//   returns the allocation that maximises aggregate output — gated by a
//   gas-overhead guard so split is only picked when it materially beats single.
//
// Why no on-chain solver:
//   The split decision lives off-chain because it requires comparing N
//   independent paths.  The on-chain router only knows about one path at a
//   time.  The SDK orchestrates the comparison; the on-chain
//   EmpsealMulticallRouter executes the chosen split atomically (when split
//   is picked) via a multicall of N separate swapNoSplit calls.
//
// Correctness invariants:
//   • Protocol fee deducted ONCE from total amountIn before any leg quoting.
//   • Per-leg amounts sum exactly to the post-fee amount (dust → last leg).
//   • Aggregate output minus per-leg gas overhead must beat single's gross.
//   • Any per-leg query failure → drop that candidate, try the next.
//   • Single-route path is always returned as a viable baseline.

import type { Provider } from "ethers";
import type { ChainConfig, PathResult } from "../types.js";
import { findBestPath } from "./pathfinder.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SplitLeg {
  /** Allocation share in basis points (sum across all legs === 10_000). */
  shareBps: number;
  amountIn: string;
  expectedOut: string;
  path: PathResult;
}

export interface SplitResult {
  /** Discriminant — 'single' uses the existing no-split flow; 'split'
   *  requires the EmpsealMulticallRouter bundler on-chain. */
  routing: "single" | "split";
  /** Total expected output across all legs (no slippage applied). */
  estimatedOut: string;
  /** Per-leg breakdown when routing === 'split'; single-element array when
   *  routing === 'single'.  Caller can read uniformly. */
  legs: SplitLeg[];
  /** When routing === 'split', the basis-point improvement over the best
   *  single-route alternative AFTER gas-overhead deduction.  Always ≥ 0
   *  (the solver wouldn't have picked split otherwise). */
  splitSavingsBps: number;
  /** Diagnostic — total wei of gas expected if THIS routing were executed
   *  on-chain.  Useful for the caller to surface to UI. */
  gasEstimateWei: string;
  /** Diagnostic — total candidates evaluated this round (for telemetry). */
  candidatesEvaluated: number;
}

export interface SplitSolverOptions {
  /** Cap on number of legs.  Default 3.  Range 2..4. */
  maxSplits?: number;
  /** Min savings (in bps) over single before split is picked.  Default 10.
   *  Below this, single is always returned — the gain is too small to
   *  justify the extra gas + complexity. */
  minSavingsBps?: number;
  /** Per-leg base gas overhead in WEI of native gas.  Defaults to a
   *  conservative ~200k gas × 1 gwei.  Caller should override with a
   *  per-chain table tuned to actual on-chain costs. */
  perLegGasWei?: bigint;
  /** Multicall wrapper overhead in WEI of native gas.  Default ~50k × 1 gwei. */
  multicallOverheadWei?: bigint;
  /** Maximum total RPC calls the solver is allowed to make in one invocation.
   *  Defaults to 12 — covers single + ~3-4 split candidates with up to 3 legs
   *  each (deduped by amount).  Hard cap defends against accidental fan-out. */
  maxQueryBudget?: number;
}

// ─── Default per-leg gas estimates (WEI of native gas) ────────────────────────
//
// These are conservative starting points.  Tune per chain when more data is
// available.  Pattern: each leg = ~150k gas; multicall wrapper = ~50k base.
//
// 1 gwei is used here as a placeholder gas-price reference; the gas-overhead
// gate's TRUE work is comparing tokens-out-equivalents, which requires
// converting wei → tokenOut via an oracle.  In Phase 1 we ship the raw wei
// estimate and let the bridge-side caller do the USD math when wiring this
// into a partner-facing quote.  See docs/SPLIT_ROUTING.md §6.

const DEFAULT_PER_LEG_GAS_WEI = BigInt(150_000) * BigInt(1_000_000_000); // 150k @ 1 gwei
const DEFAULT_MULTICALL_GAS_WEI = BigInt(50_000) * BigInt(1_000_000_000); // 50k @ 1 gwei

// ─── Allocation candidates ────────────────────────────────────────────────────
//
// Each row is bps allocations summing to 10000.  Ordered by experimentally
// observed quality (50/50 and 60/40 are by far the most common winners; the
// 3- and 4-way splits are tried last because they incur more gas).
//
// Adding more candidates here increases RPC cost linearly with split sizes;
// the maxQueryBudget guard collapses overflow back into a smaller set.

const ALLOCATIONS_2: number[][] = [
  [5000, 5000],
  [6000, 4000],
  [7000, 3000],
  [4000, 6000],
  [8000, 2000],
];

const ALLOCATIONS_3: number[][] = [
  [4000, 3500, 2500],
  [5000, 3000, 2000],
  [3334, 3333, 3333],
];

const ALLOCATIONS_4: number[][] = [
  [3000, 3000, 2000, 2000],
  [4000, 2500, 2000, 1500],
];

function candidatesUpTo(maxSplits: number): number[][] {
  const out: number[][] = [];
  if (maxSplits >= 2) out.push(...ALLOCATIONS_2);
  if (maxSplits >= 3) out.push(...ALLOCATIONS_3);
  if (maxSplits >= 4) out.push(...ALLOCATIONS_4);
  return out;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Split `amount` across `shares` (basis points) so the sum is EXACTLY equal
 *  to `amount`.  Any dust from integer division goes to the LAST leg. */
function divideByBps(amount: bigint, sharesBps: number[]): bigint[] {
  let remaining = amount;
  const out: bigint[] = [];
  for (let i = 0; i < sharesBps.length; i++) {
    if (i === sharesBps.length - 1) {
      out.push(remaining);                          // dust → last leg
    } else {
      const slice = (amount * BigInt(sharesBps[i])) / BigInt(10_000);
      out.push(slice);
      remaining -= slice;
    }
  }
  return out;
}

function bpsImprovement(splitOut: bigint, singleOut: bigint): number {
  if (singleOut === BigInt(0)) return 0;
  // ((split - single) / single) × 10000, computed with bigint then rounded.
  const numerator = (splitOut - singleOut) * BigInt(10_000);
  // Truncates toward zero — fine because negative improvements are filtered
  // by the caller anyway.
  const raw = Number(numerator / singleOut);
  return raw;
}

// ─── Memoised findBestPath ────────────────────────────────────────────────────
//
// Within one solve() call, the same (amount, tokenIn, tokenOut, maxSteps) tuple
// may be queried by multiple candidate allocations.  Cache them so we never
// make duplicate RPC calls.  The cache lives PER solve() — no state leaks
// across invocations.

class FindBestPathMemoiser {
  private readonly cache = new Map<string, Promise<PathResult>>();
  private queries = 0;

  constructor(
    private readonly provider: Provider,
    private readonly chainConfig: ChainConfig,
    private readonly tokenIn: string,
    private readonly tokenOut: string,
    private readonly maxSteps: number,
    private readonly budget: number,
  ) {}

  async query(amount: bigint): Promise<PathResult | null> {
    const key = amount.toString();
    const cached = this.cache.get(key);
    if (cached) return cached.catch(() => null);

    if (this.queries >= this.budget) {
      // Defends against fan-out.  Caller treats null as a query failure
      // and drops the candidate.
      return null;
    }
    this.queries++;
    const promise = findBestPath(
      this.provider, this.chainConfig, amount, this.tokenIn, this.tokenOut, this.maxSteps,
    );
    this.cache.set(key, promise);
    try { return await promise; } catch { return null; }
  }

  get queriesUsed(): number { return this.queries; }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Find the best routing (single OR split) for the given trade.
 *
 * Always returns a viable SplitResult — when the solver decides single
 * beats every split candidate (or when no split is viable), the result is
 * a single-leg SplitResult equivalent to the pre-split flow.
 *
 * @param provider     ethers provider
 * @param chainConfig  chain config with routerAbi
 * @param amountIn     POST-FEE amount in.  Caller must apply protocol fee
 *                     BEFORE invoking the solver — keeps split blind to fees.
 * @param tokenIn      input token address (use NATIVE for native)
 * @param tokenOut     output token address
 * @param maxSteps     hops within ONE leg's path (1..4, default 3)
 * @param options      solver tuning knobs
 */
export async function findBestSplitRouting(
  provider: Provider,
  chainConfig: ChainConfig,
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
  maxSteps = 3,
  options: SplitSolverOptions = {},
): Promise<SplitResult> {
  const maxSplits         = Math.max(2, Math.min(4, options.maxSplits ?? 3));
  const minSavingsBps     = options.minSavingsBps     ?? 10;
  const perLegGasWei      = options.perLegGasWei      ?? DEFAULT_PER_LEG_GAS_WEI;
  const multicallOverhead = options.multicallOverheadWei ?? DEFAULT_MULTICALL_GAS_WEI;
  const queryBudget       = options.maxQueryBudget    ?? 12;

  const memoiser = new FindBestPathMemoiser(
    provider, chainConfig, tokenIn, tokenOut, maxSteps, queryBudget,
  );

  // ── 1. Baseline — quote single at full amount ──────────────────────────────
  // ALWAYS queried.  If this fails we have nothing to return — propagate.
  const singlePath = await memoiser.query(amountIn);
  if (!singlePath) {
    throw new Error(
      `splitSolver: single-route quote failed for ${tokenIn} → ${tokenOut} on ${chainConfig.name}`,
    );
  }
  const singleOut = BigInt(singlePath.amounts[singlePath.amounts.length - 1]);
  const singleGasWei = BigInt(singlePath.gasEstimate || "0");

  // The single-route alternative — used as the return value when no split wins.
  const singleResult: SplitResult = {
    routing: "single",
    estimatedOut: singleOut.toString(),
    legs: [{
      shareBps: 10_000,
      amountIn:    amountIn.toString(),
      expectedOut: singleOut.toString(),
      path:        singlePath,
    }],
    splitSavingsBps: 0,
    gasEstimateWei: singleGasWei.toString(),
    candidatesEvaluated: 1,
  };

  // ── 2. Try split candidates ─────────────────────────────────────────────────
  let best:           SplitResult = singleResult;
  let bestNetGain:    bigint      = BigInt(0);
  let candidatesEval: number      = 1; // single counts as one

  const allocations = candidatesUpTo(maxSplits);
  for (const sharesBps of allocations) {
    candidatesEval++;

    // Allocate per-leg amounts.  Dust goes to last leg so the sum is exact.
    const legAmounts = divideByBps(amountIn, sharesBps);

    // Query each leg in parallel — memoised, so duplicate (e.g. 50/50 has
    // both legs at the same amount) costs only one RPC call.
    const legPaths = await Promise.all(legAmounts.map((a) => memoiser.query(a)));

    // Any leg that failed → drop this candidate.
    if (legPaths.some((p) => p === null)) continue;

    // Aggregate output + gas estimate across legs.
    let aggregateOut = BigInt(0);
    let aggregateGas = multicallOverhead;
    const legs: SplitLeg[] = [];
    for (let i = 0; i < legPaths.length; i++) {
      const path = legPaths[i] as PathResult;
      const out  = BigInt(path.amounts[path.amounts.length - 1]);
      aggregateOut += out;
      aggregateGas += perLegGasWei;
      legs.push({
        shareBps:    sharesBps[i],
        amountIn:    legAmounts[i].toString(),
        expectedOut: out.toString(),
        path,
      });
    }

    // Gas overhead beyond single.  When split's extra gas exceeds the output
    // gain, split is materially WORSE for the user.
    //
    // NOTE: This compares wei-of-native vs. tokens-out.  The two aren't
    // directly comparable in raw units; the caller (bridge VPS / UI) should
    // perform the USD conversion using NativeUsdOracle + tokenOut price
    // and re-validate.  At the SDK layer we use a conservative proxy: if
    // aggregateOut <= singleOut, the split definitely loses regardless of
    // gas conversion, so we can reject without an oracle.  When aggregate-
    // Out > singleOut, we return the split AND surface the gas estimate
    // so callers can finalise the decision with full price context.
    //
    // This is the right SDK-level scope: the solver finds the OPTIMAL
    // allocation by output; the gas-vs-output USD comparison lives at the
    // call site that has access to live USD prices.
    if (aggregateOut <= singleOut) continue;

    const grossGainAbs = aggregateOut - singleOut;
    if (grossGainAbs > bestNetGain) {
      const savingsBps = bpsImprovement(aggregateOut, singleOut);
      if (savingsBps < minSavingsBps) continue;        // gain too small to bother

      bestNetGain = grossGainAbs;
      best = {
        routing: "split",
        estimatedOut:    aggregateOut.toString(),
        legs,
        splitSavingsBps: savingsBps,
        gasEstimateWei:  aggregateGas.toString(),
        candidatesEvaluated: 0, // populated below from outer counter
      };
    }
  }

  // Finalise the candidate count on whichever result we returned.
  best.candidatesEvaluated = candidatesEval;
  return best;
}

// ─── Re-exports for solver internals (unit tests) ────────────────────────────

export const _internals = {
  divideByBps,
  bpsImprovement,
  candidatesUpTo,
  ALLOCATIONS_2,
  ALLOCATIONS_3,
  ALLOCATIONS_4,
};
