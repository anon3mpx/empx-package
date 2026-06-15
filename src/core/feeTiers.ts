// ─── Pair-Type Protocol Fees ──────────────────────────────────────────────────
//
// EmpX's production fee model is PAIR-TYPE classified, not volume-tiered:
//
//   Volatile ↔ Volatile   28 bps  (0.28%)  — e.g. ETH/ARB, WBTC/PEPE
//   Volatile ↔ Stable     15 bps  (0.15%)  — e.g. ETH/USDC, WBTC/USDT
//   Stable   ↔ Stable      9 bps  (0.09%)  — e.g. USDC/USDT, DAI/USDe
//                                            (at SDK floor, matches router MIN_FEE convention)
//
// Why pair-type and not volume-tiered:
//   - Reflects DEX economics — stable pairs have ~0 price impact + tighter
//     competing rates, so the fee must be lower to stay competitive
//   - V↔S sits in the middle — there's price impact but the destination
//     side is the user's "savings instrument", they're more price-sensitive
//   - Aligns with how 1inch / Jupiter / Aerodrome think about fee tiers
//
// Stablecoin detection — NO workaround needed:
//   The chain config already ships `STABLE_TOKENS: string[]` per chain
//   (lower-cased addresses).  Pair classification is a 2-line check.
//
// Backward compatibility:
//   - Default mode = FLAT (existing setProtocolFeeBps unchanged)
//   - Pair-type mode = OPT-IN via enablePairTypeFees()
//   - Calls without classification context fall back to flat
//
// Volume tiering can be added LATER as a layer on top of pair-type
// rates (e.g. >$1M whale trades get -5 bps off the V/V rate).  Not
// in scope for this commit.

import { MIN_PROTOCOL_FEE_BPS } from "./fees.js";
import type { FeeResolutionContext } from "../types.js";

export type { FeeResolutionContext };

// ─── Pair classification ──────────────────────────────────────────────────────

export type PairType = "V/V" | "V/S" | "S/S";

export interface PairTypeFeeConfig {
  /** Volatile ↔ Volatile pair fee (bps).  Default 28. */
  volatileVolatileBps: number;
  /** Volatile ↔ Stable pair fee (bps).  Default 15. */
  volatileStableBps: number;
  /** Stable ↔ Stable pair fee (bps).  Default 9 (= router MIN_FEE floor). */
  stableStableBps: number;
}

/** Default rates per FEE-STRUCTURE-AND-STRATEGY §4 (locked). */
export const DEFAULT_PAIR_TYPE_FEES: PairTypeFeeConfig = {
  volatileVolatileBps: 28,
  volatileStableBps: 15,
  stableStableBps: 9,
};

let _pairTypeConfig: PairTypeFeeConfig | null = null;

/**
 * Enable pair-type fee resolution.  After this call, any `getTradeInfo` /
 * `swap` call that supplies `pairType` (or `tokenInIsStable` +
 * `tokenOutIsStable`) in `feeContext` will resolve its fee from the
 * pair-type table instead of the flat `_protocolFeeBps`.
 *
 * Calls WITHOUT classification context continue to use the flat fee.
 */
export function enablePairTypeFees(
  partial?: Partial<PairTypeFeeConfig>
): PairTypeFeeConfig {
  const cfg: PairTypeFeeConfig = {
    volatileVolatileBps: partial?.volatileVolatileBps ?? DEFAULT_PAIR_TYPE_FEES.volatileVolatileBps,
    volatileStableBps: partial?.volatileStableBps ?? DEFAULT_PAIR_TYPE_FEES.volatileStableBps,
    stableStableBps: partial?.stableStableBps ?? DEFAULT_PAIR_TYPE_FEES.stableStableBps,
  };
  validatePairTypeConfig(cfg);
  _pairTypeConfig = cfg;
  return cfg;
}

export function disablePairTypeFees(): void {
  _pairTypeConfig = null;
}

export function getPairTypeConfig(): PairTypeFeeConfig | null {
  return _pairTypeConfig;
}

export function isPairTypeFeesEnabled(): boolean {
  return _pairTypeConfig !== null;
}

// ─── Stable-pair detection from chain config ─────────────────────────────────

export interface ChainStableInfo {
  /** Lower-cased addresses of recognised stablecoins on this chain. */
  STABLE_TOKENS?: readonly string[];
}

/**
 * Returns true if the given token address is a stablecoin on the given chain.
 *
 * Uses the chain config's `STABLE_TOKENS` array — already populated for every
 * chain EmpX supports.  Case-insensitive.  Returns false for the native asset
 * sentinel (`0x000...`) since native is always volatile.
 */
export function isStableToken(
  tokenAddress: string,
  chainConfig: ChainStableInfo,
): boolean {
  const stables = chainConfig.STABLE_TOKENS;
  if (!stables || stables.length === 0) return false;
  const needle = tokenAddress.toLowerCase();
  return stables.some((s) => s.toLowerCase() === needle);
}

/**
 * Classifies a token pair as V/V, V/S, or S/S.
 *
 * Order-independent: USDC→ETH and ETH→USDC both classify as V/S.
 */
export function classifyPair(
  tokenInIsStable: boolean,
  tokenOutIsStable: boolean,
): PairType {
  if (tokenInIsStable && tokenOutIsStable) return "S/S";
  if (tokenInIsStable || tokenOutIsStable) return "V/S";
  return "V/V";
}

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Resolves the protocol fee for a given trade.
 *
 * Decision tree:
 *   1. If pair-type mode is OFF → return null (caller falls back to flat fee).
 *   2. If ctx has explicit `pairType` → use it.
 *   3. Else if ctx has both `tokenInIsStable` + `tokenOutIsStable` → classify.
 *   4. Else → return null (caller falls back to flat fee).
 *   5. Look up the configured bps for the resolved pair type.
 *   6. Clamp to MIN_PROTOCOL_FEE_BPS.
 *
 * Note: `isStablePair` (legacy field from the previous tier model) is
 * still honoured — true → S/S, false → V/V.  This keeps existing
 * integration call sites working.
 */
export function resolveTieredFeeBps(ctx: FeeResolutionContext): number | null {
  if (!_pairTypeConfig) return null;

  const pairType = derivePairType(ctx);
  if (pairType === null) return null;

  let fee: number;
  switch (pairType) {
    case "S/S": fee = _pairTypeConfig.stableStableBps; break;
    case "V/S": fee = _pairTypeConfig.volatileStableBps; break;
    case "V/V": fee = _pairTypeConfig.volatileVolatileBps; break;
  }

  return Math.max(fee, Number(MIN_PROTOCOL_FEE_BPS));
}

function derivePairType(ctx: FeeResolutionContext): PairType | null {
  if (ctx.pairType) return ctx.pairType;
  if (ctx.tokenInIsStable !== undefined && ctx.tokenOutIsStable !== undefined) {
    return classifyPair(ctx.tokenInIsStable, ctx.tokenOutIsStable);
  }
  // Legacy: isStablePair boolean from the previous tier model.
  // true → S/S, false → V/V (we lose V/S discrimination but stay correct
  // at the endpoints).  Callers should migrate to tokenInIsStable +
  // tokenOutIsStable for accurate V/S classification.
  if (ctx.isStablePair === true) return "S/S";
  if (ctx.isStablePair === false) return "V/V";
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validatePairTypeConfig(cfg: PairTypeFeeConfig): void {
  const entries: Array<[string, number]> = [
    ["volatileVolatileBps", cfg.volatileVolatileBps],
    ["volatileStableBps", cfg.volatileStableBps],
    ["stableStableBps", cfg.stableStableBps],
  ];
  for (const [name, bps] of entries) {
    if (!Number.isFinite(bps)) {
      throw new Error(`${name} must be a finite number, got ${bps}`);
    }
    if (bps < Number(MIN_PROTOCOL_FEE_BPS)) {
      throw new Error(
        `${name} = ${bps} bps is below router min ${MIN_PROTOCOL_FEE_BPS.toString()} bps`
      );
    }
    if (bps > 10_000) {
      throw new Error(`${name} = ${bps} bps exceeds 100% (10000 bps)`);
    }
  }
}

// ─── Deprecated volume-tier API (kept as no-op stubs for backward compat) ────
//
// The previous version of this module shipped a volume-tiered fee resolver
// (DEFAULT_FEE_TIERS / enableTieredFees / FeeTier).  That model didn't match
// EmpX's production fee economics — replaced by pair-type classification
// above.  The old exports are kept as no-op stubs so any caller that
// already imported them doesn't error on import.

/** @deprecated Use `enablePairTypeFees()` instead. */
export interface FeeTier {
  upToUSD: number;
  feeBps: number;
}

/** @deprecated Use `DEFAULT_PAIR_TYPE_FEES` instead. */
export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { upToUSD: Number.POSITIVE_INFINITY, feeBps: 28 },
];

/** @deprecated Stable discount is now folded into the pair-type rates. */
export const DEFAULT_STABLE_DISCOUNT_BPS = 0;

/** @deprecated Pair-type fees replace the volume-tier model. */
export interface TieredFeeConfig {
  tiers: FeeTier[];
  stableDiscountBps: number;
}

/** @deprecated Use `enablePairTypeFees()` instead. */
export function enableTieredFees(_partial?: Partial<TieredFeeConfig>): TieredFeeConfig {
  enablePairTypeFees();
  return { tiers: DEFAULT_FEE_TIERS, stableDiscountBps: 0 };
}

/** @deprecated Use `disablePairTypeFees()` instead. */
export function disableTieredFees(): void {
  disablePairTypeFees();
}

/** @deprecated Use `isPairTypeFeesEnabled()` instead. */
export function isTieredFeesEnabled(): boolean {
  return isPairTypeFeesEnabled();
}

/** @deprecated Use `getPairTypeConfig()` instead. */
export function getTieredFeeConfig(): TieredFeeConfig | null {
  return _pairTypeConfig ? { tiers: DEFAULT_FEE_TIERS, stableDiscountBps: 0 } : null;
}
