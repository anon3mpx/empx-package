// ─── Input Validators ─────────────────────────────────────────────────────────
// Strict guardrails for agent-driven inputs.
// Called at the top of getTradeInfo() and swap() to prevent unsafe calls.

"use strict";

const { EmpxError, ERROR_CODES } = require("./errors");

/**
 * Maximum allowed slippage in basis points (10% = 1000 bps).
 * Agents often set very high slippage by mistake — this is a hard cap.
 */
const MAX_SLIPPAGE_BPS = 1000;

/**
 * Valid maxSteps range (on-chain router supports 1–4 hops).
 */
const MIN_STEPS = 1;
const MAX_STEPS = 4;

/**
 * Validates that a string looks like an EVM hex address (0x + 40 hex chars).
 * Does NOT check checksum — accepts lowercase/uppercase/mixed.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidAddress(value) {
    return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Validates that a value can be parsed as a positive BigInt.
 *
 * @param {string|bigint|number} value
 * @returns {boolean}
 */
function isPositiveBigInt(value) {
    try {
        return BigInt(value) > BigInt(0);
    } catch {
        return false;
    }
}

/**
 * Validates parameters for getTradeInfo() / swap().
 * Throws EmpxError (machine-readable) on any violation.
 *
 * @param {object} params
 * @param {string|bigint} params.amountIn
 * @param {string}        params.tokenIn
 * @param {string}        params.tokenOut
 * @param {number}        params.maxSteps
 * @param {number}        params.slippageBps
 * @param {string}        params.nativeAddress - chain's NATIVE_ADDRESS (allowed as tokenIn/tokenOut)
 */
function validateTradeParams({ amountIn, tokenIn, tokenOut, maxSteps, slippageBps, nativeAddress }) {
    // amountIn
    if (!isPositiveBigInt(amountIn)) {
        throw new EmpxError(
            ERROR_CODES.INVALID_AMOUNT,
            `amountIn must be a positive integer string or bigint, got: ${amountIn}`,
            false,
            { amountIn }
        );
    }

    // tokenIn
    const nativeNorm = nativeAddress.toLowerCase();
    if (tokenIn.toLowerCase() !== nativeNorm && !isValidAddress(tokenIn)) {
        throw new EmpxError(
            ERROR_CODES.INVALID_ADDRESS,
            `tokenIn is not a valid EVM address: ${tokenIn}`,
            false,
            { tokenIn }
        );
    }

    // tokenOut
    if (tokenOut.toLowerCase() !== nativeNorm && !isValidAddress(tokenOut)) {
        throw new EmpxError(
            ERROR_CODES.INVALID_ADDRESS,
            `tokenOut is not a valid EVM address: ${tokenOut}`,
            false,
            { tokenOut }
        );
    }

    // maxSteps
    if (
        typeof maxSteps !== "number" ||
        !Number.isInteger(maxSteps) ||
        maxSteps < MIN_STEPS ||
        maxSteps > MAX_STEPS
    ) {
        throw new EmpxError(
            ERROR_CODES.STEPS_OUT_OF_RANGE,
            `maxSteps must be an integer between ${MIN_STEPS} and ${MAX_STEPS}, got: ${maxSteps}`,
            false,
            { maxSteps }
        );
    }

    // slippageBps
    if (
        typeof slippageBps !== "number" ||
        !Number.isInteger(slippageBps) ||
        slippageBps < 0 ||
        slippageBps > MAX_SLIPPAGE_BPS
    ) {
        throw new EmpxError(
            ERROR_CODES.SLIPPAGE_TOO_HIGH,
            `slippageBps must be between 0 and ${MAX_SLIPPAGE_BPS} (10%), got: ${slippageBps}`,
            false,
            { slippageBps, maxAllowed: MAX_SLIPPAGE_BPS }
        );
    }
}

/**
 * Validates that a quote's validUntil timestamp has not passed.
 * Call this before submitting calldata built from a tradeInfo.
 *
 * @param {{ validUntil: number }} tradeInfo
 * @throws {EmpxError} QUOTE_EXPIRED if the quote is stale
 */
function assertQuoteNotExpired(tradeInfo) {
    if (tradeInfo.validUntil && Date.now() > tradeInfo.validUntil) {
        throw new EmpxError(
            ERROR_CODES.QUOTE_EXPIRED,
            `Quote ${tradeInfo.quoteId} expired at ${new Date(tradeInfo.validUntil).toISOString()}`,
            true, // retryable — agent should re-fetch tradeInfo
            { quoteId: tradeInfo.quoteId, validUntil: tradeInfo.validUntil }
        );
    }
}

module.exports = {
    validateTradeParams,
    assertQuoteNotExpired,
    isValidAddress,
    isPositiveBigInt,
    MAX_SLIPPAGE_BPS,
};
