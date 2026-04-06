// ─── Agent Tool Schemas ───────────────────────────────────────────────────────
// JSON-Schema definitions for all public SDK methods.
// Drop these directly into OpenAI Agents SDK or LangChain tool registries.

"use strict";

// ─── Reusable schema fragments ─────────────────────────────────────────────────

const addressSchema = {
    type: "string",
    pattern: "^0x[0-9a-fA-F]{40}$",
    description: "EVM hex address (42 chars). Use chain.NATIVE_ADDRESS (0x000...000) for native currency.",
};

const rawAmountSchema = {
    type: "string",
    pattern: "^[0-9]+$",
    description: "Raw token amount as a decimal integer string (e.g. '1000000000000000000' = 1 token with 18 decimals).",
};

const maxStepsSchema = {
    type: "integer",
    enum: [1, 2, 3, 4],
    default: 3,
    description: "Maximum number of hops in the swap route. Higher = more paths explored but slower. Recommended: 3.",
};

const slippageBpsSchema = {
    type: "integer",
    minimum: 0,
    maximum: 1000,
    default: 200,
    description: "Slippage tolerance in basis points (100 bps = 1%). Maximum enforced by SDK: 1000 (10%).",
};

// ─── Tool schemas ─────────────────────────────────────────────────────────────

/**
 * OpenAI/LangChain-compatible JSON Schema definitions for all public methods.
 * Use as the `parameters` field in an OpenAI tool or LangChain StructuredTool.
 *
 * @example
 * // OpenAI Agents SDK:
 * const tool = {
 *   type: "function",
 *   function: {
 *     name: TOOL_SCHEMAS.getTradeInfo.name,
 *     description: TOOL_SCHEMAS.getTradeInfo.description,
 *     parameters: TOOL_SCHEMAS.getTradeInfo.inputSchema,
 *   }
 * };
 */
const TOOL_SCHEMAS = {

    getTradeInfo: {
        name: "getTradeInfo",
        description:
            "Find the optimal swap route for a token pair on a specific EVM chain and return a tradeInfo object " +
            "with slippage already applied. The result includes a quoteId and validUntil TTL. " +
            "Pass tradeInfo directly to getSwapCalldata or swap(). Does NOT submit any transaction.",
        inputSchema: {
            type: "object",
            properties: {
                chainId:     { type: "integer", description: "EVM chain ID (e.g. 42161 for Arbitrum, 369 for PulseChain)." },
                amountIn:    rawAmountSchema,
                tokenIn:     addressSchema,
                tokenOut:    addressSchema,
                maxSteps:    maxStepsSchema,
                slippageBps: slippageBpsSchema,
            },
            required: ["chainId", "amountIn", "tokenIn", "tokenOut"],
        },
        outputSchema: {
            type: "object",
            properties: {
                amountIn:    rawAmountSchema,
                amountOut:   rawAmountSchema,
                fee:         { type: "string", description: "Protocol fee in basis points." },
                gasEstimate: { type: "string", description: "Estimated gas units for the swap." },
                quoteId:     { type: "string", format: "uuid", description: "Unique ID for this quote. Log this for traceability." },
                timestamp:   { type: "integer", description: "Unix ms timestamp when this quote was computed." },
                validUntil:  { type: "integer", description: "Unix ms timestamp after which this quote should be re-fetched." },
                sdkVersion:  { type: "string", description: "empx-swap-sdk-beta version that produced this quote." },
            },
        },
    },

    swap: {
        name: "swap",
        description:
            "All-in-one swap: finds the best route, applies slippage, and returns the correct calldata for the swap type " +
            "(WrapNative, UnwrapNative, NativeToERC20, ERC20ToNative, or ERC20ToERC20). " +
            "Returns { tradeInfo, calldata, swapType }. DO NOT execute calldata — return it to the caller.",
        inputSchema: {
            type: "object",
            properties: {
                chainId:     { type: "integer" },
                amountIn:    rawAmountSchema,
                tokenIn:     addressSchema,
                tokenOut:    addressSchema,
                toAddress:   { ...addressSchema, description: "Recipient wallet address for output tokens." },
                maxSteps:    maxStepsSchema,
                slippageBps: slippageBpsSchema,
            },
            required: ["chainId", "amountIn", "tokenIn", "tokenOut", "toAddress"],
        },
    },

    getSwapCalldata: {
        name: "getSwapCalldata",
        description:
            "Builds ERC-20 → ERC-20 swap calldata from a tradeInfo object. Returns { to, data, value }. " +
            "Ensure the router is approved to spend tokenIn before submitting. " +
            "Check tradeInfo.validUntil — reject if expired.",
        inputSchema: {
            type: "object",
            properties: {
                tradeInfo: { type: "object", description: "TradeInfo object returned by getTradeInfo()." },
                toAddress: addressSchema,
            },
            required: ["tradeInfo", "toAddress"],
        },
    },

    checkAllowance: {
        name: "checkAllowance",
        description:
            "Checks whether ownerAddress has approved the router to spend at least requiredAmount of tokenAddress. " +
            "Call this before building ERC-20 swap calldata.",
        inputSchema: {
            type: "object",
            properties: {
                chainId:        { type: "integer" },
                tokenAddress:   addressSchema,
                ownerAddress:   addressSchema,
                requiredAmount: rawAmountSchema,
            },
            required: ["chainId", "tokenAddress", "ownerAddress", "requiredAmount"],
        },
    },

    getApprovalCalldata: {
        name: "getApprovalCalldata",
        description:
            "Builds ERC-20 approval calldata for the router to spend a token. Returns { to, data, value }. " +
            "Pass the result to the signer. This is a prerequisite for ERC-20 swaps.",
        inputSchema: {
            type: "object",
            properties: {
                chainId:      { type: "integer" },
                tokenAddress: addressSchema,
                amount:       { ...rawAmountSchema, description: "Approval amount. Omit for unlimited (MaxUint256)." },
            },
            required: ["chainId", "tokenAddress"],
        },
    },

    getQuoteUSD: {
        name: "getQuoteUSD",
        description: "Returns the USD value of a raw token amount. Useful for validating trade size before building calldata.",
        inputSchema: {
            type: "object",
            properties: {
                chainId:      { type: "integer" },
                tokenAddress: addressSchema,
                rawAmount:    rawAmountSchema,
                maxSteps:     maxStepsSchema,
            },
            required: ["chainId", "tokenAddress", "rawAmount"],
        },
    },
};

module.exports = { TOOL_SCHEMAS };
