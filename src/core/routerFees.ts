import type { ChainConfig, FeeResolutionContext, RouterConfig } from "../types.js";
import {
  getProtocolFeeBps,
  normalizeProtocolFeeBps,
} from "./fees.js";
import {
  DEFAULT_PAIR_TYPE_FEES,
  isPairTypeFeesEnabled,
  isStableToken,
  resolveTieredFeeBps,
  type PairTypeFeeConfig,
} from "./feeTiers.js";

export type FeeResolver = (
  feeContext?: FeeResolutionContext,
  tokenIn?: string,
  tokenOut?: string,
) => bigint;

function normalizePairTypeConfig(partial: Exclude<NonNullable<RouterConfig["pairTypeFees"]>, false>): PairTypeFeeConfig {
  const cfg: PairTypeFeeConfig = {
    volatileVolatileBps: partial.volatileVolatileBps ?? DEFAULT_PAIR_TYPE_FEES.volatileVolatileBps,
    volatileStableBps: partial.volatileStableBps ?? DEFAULT_PAIR_TYPE_FEES.volatileStableBps,
    stableStableBps: partial.stableStableBps ?? DEFAULT_PAIR_TYPE_FEES.stableStableBps,
  };

  for (const [name, value] of Object.entries(cfg)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number, got ${value}`);
    }
    if (value < 9) {
      throw new Error(`${name} = ${value} bps is below router min 9 bps`);
    }
    if (value > 10_000) {
      throw new Error(`${name} = ${value} bps exceeds 100% (10000 bps)`);
    }
  }

  return cfg;
}

function resolvePairTypeFeeBps(cfg: PairTypeFeeConfig, ctx: FeeResolutionContext): number | null {
  const pairType = ctx.pairType
    ?? (ctx.tokenInIsStable !== undefined && ctx.tokenOutIsStable !== undefined
      ? (ctx.tokenInIsStable && ctx.tokenOutIsStable ? "S/S" : ctx.tokenInIsStable || ctx.tokenOutIsStable ? "V/S" : "V/V")
      : ctx.isStablePair === true ? "S/S" : ctx.isStablePair === false ? "V/V" : null);

  if (pairType === null) return null;
  if (pairType === "S/S") return cfg.stableStableBps;
  if (pairType === "V/S") return cfg.volatileStableBps;
  return cfg.volatileVolatileBps;
}

export function createFeeResolver(config: RouterConfig, chainConfig: ChainConfig): FeeResolver {
  const instanceProtocolFeeBps = config.protocolFeeBps == null
    ? undefined
    : normalizeProtocolFeeBps(config.protocolFeeBps);
  const instancePairTypeFees = config.pairTypeFees === false
    ? null
    : config.pairTypeFees
      ? normalizePairTypeConfig(config.pairTypeFees)
      : undefined;

  return (feeContext = {}, tokenIn, tokenOut) => {
    const effectiveCtx: FeeResolutionContext = {
      ...feeContext,
      tokenInIsStable: feeContext.tokenInIsStable
        ?? (tokenIn ? isStableToken(tokenIn, chainConfig) : undefined),
      tokenOutIsStable: feeContext.tokenOutIsStable
        ?? (tokenOut ? isStableToken(tokenOut, chainConfig) : undefined),
    };

    if (instancePairTypeFees) {
      const resolved = resolvePairTypeFeeBps(instancePairTypeFees, effectiveCtx);
      if (resolved !== null) return BigInt(resolved);
    }

    if (instanceProtocolFeeBps !== undefined) {
      return instanceProtocolFeeBps;
    }

    if (instancePairTypeFees !== null && isPairTypeFeesEnabled()) {
      const resolved = resolveTieredFeeBps(effectiveCtx);
      if (resolved !== null) return BigInt(resolved);
    }

    return BigInt(getProtocolFeeBps());
  };
}
