// ─── EmpxError — structured, machine-readable errors ─────────────────────────
// AI agents need predictable error shapes, not raw thrown strings.
// All errors thrown by empx-swap-sdk-beta use this class.

"use strict";

/**
 * Error codes emitted by the SDK.
 * Agents can branch on these codes without parsing human-readable messages.
 */
const ERROR_CODES = {
    // Input validation
    INVALID_INPUT:          "INVALID_INPUT",
    INVALID_ADDRESS:        "INVALID_ADDRESS",
    INVALID_AMOUNT:         "INVALID_AMOUNT",
    INVALID_CHAIN:          "INVALID_CHAIN",
    SLIPPAGE_TOO_HIGH:      "SLIPPAGE_TOO_HIGH",
    STEPS_OUT_OF_RANGE:     "STEPS_OUT_OF_RANGE",

    // Trade / routing
    AMOUNT_TOO_SMALL:       "AMOUNT_TOO_SMALL",
    INSUFFICIENT_LIQUIDITY: "INSUFFICIENT_LIQUIDITY",
    NO_ROUTE_FOUND:         "NO_ROUTE_FOUND",
    QUOTE_EXPIRED:          "QUOTE_EXPIRED",

    // Provider / network
    RPC_ERROR:              "RPC_ERROR",
    PRICE_FETCH_FAILED:     "PRICE_FETCH_FAILED",
};

/**
 * Structured error thrown by empx-swap-sdk-beta.
 *
 * @example
 * // In agent code:
 * try {
 *   await router.getTradeInfo(...)
 * } catch (err) {
 *   if (err.code === "SLIPPAGE_TOO_HIGH") { ... }
 *   // Or get a structured JSON payload:
 *   console.log(err.toJSON());
 * }
 */
class EmpxError extends Error {
    /**
     * @param {string}  code      - One of ERROR_CODES
     * @param {string}  message   - Human-readable description
     * @param {boolean} [retryable=false] - Whether the agent may safely retry the call
     * @param {object}  [context]  - Optional extra context for debugging
     */
    constructor(code, message, retryable = false, context = {}) {
        super(message);
        this.name      = "EmpxError";
        this.code      = code;
        this.retryable = retryable;
        this.context   = context;
        // Maintain proper prototype chain in compiled JS environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, EmpxError);
        }
    }

    /**
     * Returns a machine-readable JSON representation.
     * AI agents should use this for structured error handling.
     *
     * @returns {{ error: { code: string, message: string, retryable: boolean, context: object } }}
     */
    toJSON() {
        return {
            error: {
                code:      this.code,
                message:   this.message,
                retryable: this.retryable,
                context:   this.context,
            },
        };
    }
}

module.exports = { EmpxError, ERROR_CODES };
