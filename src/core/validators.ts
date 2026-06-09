// ─── Input Validators ─────────────────────────────────────────────────────────
import type { TradeInfo, AffiliateConfig } from "../types.js";
import { ERROR_CODES } from "../types.js";
import { EmpxError } from "./errors.js";

export const MAX_SLIPPAGE_BPS = 1000;
export const MIN_STEPS = 1;
export const MAX_STEPS = 4;
export const MIN_AFFILIATE_FEE_BPS = 1;
export const MAX_AFFILIATE_FEE_BPS = 9000;

export function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isPositiveBigInt(value: unknown): boolean {
  try {
    return BigInt(value as string) > BigInt(0);
  } catch {
    return false;
  }
}

export interface TradeParams {
  amountIn: string | bigint;
  tokenIn: string;
  tokenOut: string;
  maxSteps: number;
  slippageBps: number;
  nativeAddress: string;
}

export function validateTradeParams({
  amountIn, tokenIn, tokenOut, maxSteps, slippageBps, nativeAddress,
}: TradeParams): void {
  if (!isPositiveBigInt(amountIn)) {
    throw new EmpxError(ERROR_CODES.INVALID_AMOUNT,
      `amountIn must be a positive integer string or bigint, got: ${amountIn}`,
      false, { amountIn });
  }

  const nativeNorm = nativeAddress.toLowerCase();

  if (tokenIn.toLowerCase() !== nativeNorm && !isValidAddress(tokenIn)) {
    throw new EmpxError(ERROR_CODES.INVALID_ADDRESS,
      `tokenIn is not a valid EVM address: ${tokenIn}`,
      false, { tokenIn });
  }

  if (tokenOut.toLowerCase() !== nativeNorm && !isValidAddress(tokenOut)) {
    throw new EmpxError(ERROR_CODES.INVALID_ADDRESS,
      `tokenOut is not a valid EVM address: ${tokenOut}`,
      false, { tokenOut });
  }

  if (typeof maxSteps !== "number" || !Number.isInteger(maxSteps) ||
      maxSteps < MIN_STEPS || maxSteps > MAX_STEPS) {
    throw new EmpxError(ERROR_CODES.STEPS_OUT_OF_RANGE,
      `maxSteps must be an integer between ${MIN_STEPS} and ${MAX_STEPS}, got: ${maxSteps}`,
      false, { maxSteps });
  }

  if (typeof slippageBps !== "number" || !Number.isInteger(slippageBps) ||
      slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new EmpxError(ERROR_CODES.SLIPPAGE_TOO_HIGH,
      `slippageBps must be between 0 and ${MAX_SLIPPAGE_BPS} (10%), got: ${slippageBps}`,
      false, { slippageBps, maxAllowed: MAX_SLIPPAGE_BPS });
  }
}

export function validateAffiliateConfig(config: AffiliateConfig): void {
  if (!isValidAddress(config.address)) {
    throw new EmpxError(ERROR_CODES.INVALID_AFFILIATE,
      `affiliate.address is not a valid EVM address: ${config.address}`,
      false, { address: config.address });
  }

  if (typeof config.feeBps !== "number" || !Number.isInteger(config.feeBps) ||
      config.feeBps < MIN_AFFILIATE_FEE_BPS || config.feeBps > MAX_AFFILIATE_FEE_BPS) {
    throw new EmpxError(ERROR_CODES.INVALID_AFFILIATE,
      `affiliate.feeBps must be between ${MIN_AFFILIATE_FEE_BPS} and ${MAX_AFFILIATE_FEE_BPS}, got: ${config.feeBps}`,
      false, { feeBps: config.feeBps, min: MIN_AFFILIATE_FEE_BPS, max: MAX_AFFILIATE_FEE_BPS });
  }
}

export function assertQuoteNotExpired(tradeInfo: Pick<TradeInfo, "validUntil" | "quoteId">): void {
  if (tradeInfo.validUntil && Date.now() > tradeInfo.validUntil) {
    throw new EmpxError(ERROR_CODES.QUOTE_EXPIRED,
      `Quote ${tradeInfo.quoteId} expired at ${new Date(tradeInfo.validUntil).toISOString()}`,
      true, { quoteId: tradeInfo.quoteId, validUntil: tradeInfo.validUntil });
  }
}
