// ─── Fee Management ───────────────────────────────────────────────────────────
import type { AffiliateConfig } from "../types.js";

export const DEFAULT_PROTOCOL_FEE_BPS = BigInt(28);
export const MIN_PROTOCOL_FEE_BPS = BigInt(9);
const BPS_DIVISOR = BigInt(10_000);
const AFFILIATE_SHARE_DIVISOR = BigInt(10_000);

let _protocolFeeBps: bigint = DEFAULT_PROTOCOL_FEE_BPS;

export function normalizeProtocolFeeBps(feeRaw: string | number | bigint): bigint {
  let fee: bigint;
  try { fee = BigInt(feeRaw); } catch {
    throw new Error(`Invalid protocol fee: "${feeRaw}"`);
  }
  if (fee < MIN_PROTOCOL_FEE_BPS) {
    throw new Error(
      `Protocol fee cannot be below router min fee (${MIN_PROTOCOL_FEE_BPS.toString()} bps). Received: ${fee.toString()}`
    );
  }
  return fee;
}

export function setProtocolFeeBps(nextFeeBps: string | number | bigint): string {
  _protocolFeeBps = normalizeProtocolFeeBps(nextFeeBps);
  return _protocolFeeBps.toString();
}

export function getProtocolFeeBps(): string {
  return _protocolFeeBps.toString();
}

export function applyProtocolFee(amountIn: string | bigint, feeBps: bigint): bigint {
  const amount = BigInt(amountIn);
  return (amount * (BPS_DIVISOR - feeBps)) / BPS_DIVISOR;
}

export function calculateAffiliateAmount(
  amountIn: string | bigint,
  protocolFeeBps: bigint,
  affiliateConfig: AffiliateConfig
): bigint {
  const amount = BigInt(amountIn);
  const protocolFeeAmount = (amount * protocolFeeBps) / BPS_DIVISOR;
  return (protocolFeeAmount * BigInt(affiliateConfig.feeBps)) / AFFILIATE_SHARE_DIVISOR;
}

export function affiliateAbsoluteBps(
  protocolFeeBps: bigint,
  affiliateFeeBps: number
): number {
  return Number((protocolFeeBps * BigInt(affiliateFeeBps)) / AFFILIATE_SHARE_DIVISOR);
}

export interface FeeBreakdown {
  protocolFeeBps: string;
  affiliateFeeBps: string;
  affiliateAbsoluteBps: string;
  totalFeeBps: string;
}

export function buildFeeBreakdown(
  protocolFeeBps: bigint,
  affiliate?: AffiliateConfig
): FeeBreakdown {
  const affBps = affiliate?.feeBps ?? 0;
  const affAbsolute = affiliate ? affiliateAbsoluteBps(protocolFeeBps, affBps) : 0;

  return {
    protocolFeeBps: protocolFeeBps.toString(),
    affiliateFeeBps: affBps.toString(),
    affiliateAbsoluteBps: affAbsolute.toString(),
    totalFeeBps: protocolFeeBps.toString(),
  };
}
