// ─── Agent Tool Schemas ───────────────────────────────────────────────────────
// JSON Schema definitions for all public SDK methods.
// Drop these directly into OpenAI Agents SDK, LangChain, Claude tools, etc.
//
// Every schema includes:
//   - name        → function name to register
//   - description → natural language prompt that guides the LLM on WHEN to call it
//   - inputSchema → JSON Schema for parameters (validated by SDK at runtime)
//   - outputSchema → shape of the returned value (helps agent parse response)
//   - agentHints  → extra guidance for AI agents specifically

import type { ToolSchema } from "../types.js";
import { CHAIN_IDS } from "../chains/index.js";

// ─── Reusable schema fragments ─────────────────────────────────────────────────

const addressSchema = {
  type: "string",
  pattern: "^0x[0-9a-fA-F]{40}$",
  description: "EVM hex address (42 chars). Use chain.NATIVE_ADDRESS (0x000...000) for native currency.",
};

const rawAmountSchema = {
  type: "string",
  pattern: "^[0-9]+$",
  description:
    "Raw token amount as a decimal integer string " +
    "(e.g. '1000000000000000000' = 1 token with 18 decimals, '1000000' = 1 USDC with 6 decimals). " +
    "Never use floating point — always use the smallest unit.",
};

const maxStepsSchema = {
  type: "integer",
  enum: [1, 2, 3, 4],
  default: 3,
  description: "Maximum number of hops in the swap route. 3 is the recommended default.",
};

const slippageBpsSchema = {
  type: "integer",
  minimum: 0,
  maximum: 1000,
  default: 200,
  description:
    "Slippage tolerance in basis points (100 bps = 1%). " +
    "Default 200 = 2%. Max allowed by SDK is 1000 (10%). " +
    "For stable pairs use 50–100. For volatile tokens use 200–500.",
};

const chainIdSchema = {
  type: "integer",
  enum: Object.values(CHAIN_IDS),
  description:
    "EVM chain ID. Supported chains: " +
    Object.entries(CHAIN_IDS)
      .map(([name, id]) => `${id} (${name})`)
      .join(", "),
};

const chainIdsSchema = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: chainIdSchema,
  description: "One or more supported EVM chain IDs. Values must be unique.",
};

const providerInputSchema = {
  oneOf: [
    { type: "string", description: "Single RPC URL for one chain." },
    {
      type: "array",
      minItems: 1,
      items: { type: "string" },
      description: "Ordered fallback RPC URLs for one chain.",
    },
  ],
  description:
    "Provider input for one chain. Prefer per-chain providers because most RPC URLs are network-specific.",
};

const providerMapSchema = {
  type: "object",
  additionalProperties: providerInputSchema,
  description:
    "Map of chainId string to provider input. Keys must be included in the requested chainIds.",
};

// ─── Tool Schemas ─────────────────────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, ToolSchema & { agentHints?: string }> = {

  // ── Chain discovery ──────────────────────────────────────────────────────────

  getSupportedChains: {
    name: "getSupportedChains",
    description:
      "Returns all supported EVM chains with their chain IDs, names, RPC URLs, native currency, " +
      "and contract addresses. Call this first if you don't know which chain to use or the user " +
      "asks 'what chains are supported?'",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chainId: { type: "integer" },
          name: { type: "string" },
          nativeCurrency: { type: "object" },
          rpcUrl: { type: "string" },
          ROUTER_ADDRESS: { type: "string" },
        },
      },
    },
    agentHints: "Use this to discover chains before asking for a chainId from the user.",
  },

  createRouters: {
    name: "createRouters",
    description:
      "Creates router instances for multiple supported chains in one call. " +
      "Use this for portfolio views, cross-chain dashboards, or agent workflows that need to query several chains. " +
      "Prefer per-chain providers because most RPC URLs are chain-specific.",
    inputSchema: {
      type: "object",
      required: ["chainIds"],
      properties: {
        chainIds: chainIdsSchema,
        providers: providerMapSchema,
        defaultProvider: providerInputSchema,
        integratorId: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{64}$",
          description: "Optional bytes32 integrator ID applied to every router in the batch.",
        },
        affiliate: {
          type: "object",
          properties: {
            address: addressSchema,
            feeBps: { type: "integer", minimum: 0, maximum: 10000 },
          },
          description: "Optional off-chain affiliate config applied to every router in the batch.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          chain: { type: "object" },
          integratorId: { type: "string" },
        },
      },
      description: "Map of chainId to router instance.",
    },
    agentHints:
      "Call getSupportedChains first if you do not know the chain IDs. " +
      "Do not pass the same RPC URL to multiple chains unless the endpoint explicitly supports multiple networks.",
  },

  getAllChainRouters: {
    name: "getAllChainRouters",
    description:
      "Creates one router for every supported chain. " +
      "Use this for all-chain discovery, monitoring, and broad price sweeps.",
    inputSchema: {
      type: "object",
      properties: {
        providers: providerMapSchema,
        defaultProvider: providerInputSchema,
        integratorId: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{64}$",
          description: "Optional bytes32 integrator ID applied to every router.",
        },
        affiliate: {
          type: "object",
          properties: {
            address: addressSchema,
            feeBps: { type: "integer", minimum: 0, maximum: 10000 },
          },
          description: "Optional off-chain affiliate config applied to every router.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          chain: { type: "object" },
          integratorId: { type: "string" },
        },
      },
      description: "Map of every supported chainId to router instance.",
    },
    agentHints:
      "Use this only when the workflow genuinely needs every supported chain. " +
      "For a known subset, use createRouters with explicit chainIds.",
  },

  // ── Wallet management ────────────────────────────────────────────────────────

  createBurnerWallet: {
    name: "createBurnerWallet",
    description:
      "Creates a new ephemeral agent-controlled wallet (burner wallet) with a fresh private key. " +
      "Use this when you need an on-chain identity for the agent that is SEPARATE from the user's wallet. " +
      "The returned mnemonic and privateKey must be saved if the wallet needs to persist. " +
      "NEVER log or transmit privateKey. " +
      "Typical agent flow: createBurnerWallet → user sends gas → agent executes swaps.",
    inputSchema: {
      type: "object",
      properties: {
        rpcUrl: { type: "string", description: "Optional RPC URL to connect the wallet to." },
        mnemonic: {
          type: "string",
          description: "Optional 12/24-word mnemonic to restore an existing burner wallet.",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "The wallet's public address — share this with users for funding." },
        mnemonic: { type: "string", description: "BIP-39 mnemonic — save this for persistence." },
        type: { type: "string", const: "burner" },
        isAgentWallet: { type: "boolean", const: true },
      },
    },
    agentHints:
      "Create one burner wallet per agent session and reuse it. Store the mnemonic securely. " +
      "Tell the user to send a small amount of native gas (e.g. 0.01 ETH) to the agent address before swapping.",
  },

  getWalletBalance: {
    name: "getWalletBalance",
    description: "Returns the native token balance (ETH, BNB, PLS, etc.) of a wallet address.",
    inputSchema: {
      type: "object",
      required: ["chainId", "address"],
      properties: {
        chainId: chainIdSchema,
        address: addressSchema,
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        raw: { type: "string" },
        formatted: { type: "string", description: "Human-readable balance (e.g. '0.05')" },
      },
    },
  },

  // ── Price discovery ──────────────────────────────────────────────────────────

  getTokenPriceUSD: {
    name: "getTokenPriceUSD",
    description:
      "Returns the current USD price per 1 full unit of a token on a given chain. " +
      "Use this before a swap to validate trade size or display price to the user.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        maxSteps: maxStepsSchema,
      },
    },
    outputSchema: { type: "number", description: "USD price per full token unit" },
    agentHints: "Call this before getTradeInfo to sanity-check amounts.",
  },

  getQuoteUSD: {
    name: "getQuoteUSD",
    description:
      "Returns the USD value of a specific raw token amount. " +
      "Use this to translate between raw amounts and human-readable USD values.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress", "rawAmount"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        rawAmount: rawAmountSchema,
        maxSteps: maxStepsSchema,
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        usd: { type: "number" },
        pricePerToken: { type: "number" },
        decimals: { type: "integer" },
        humanAmount: { type: "number" },
      },
    },
  },

  getMultipleTokenPricesUSD: {
    name: "getMultipleTokenPricesUSD",
    description: "Returns USD prices for multiple tokens in a single parallel call. Efficient for portfolio views.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddresses"],
      properties: {
        chainId: chainIdSchema,
        tokenAddresses: { type: "array", items: addressSchema },
        maxSteps: maxStepsSchema,
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: { type: "number" },
      description: "Map of tokenAddress → USD price",
    },
  },

  // ── Trade lifecycle ──────────────────────────────────────────────────────────

  getTradeInfo: {
    name: "getTradeInfo",
    description:
      "Finds the optimal on-chain swap route and returns a tradeInfo object with slippage applied. " +
      "This is step 1 of every manual swap flow — always call this before getSwapCalldata or prepareSwap(). " +
      "The tradeInfo has a 30-second TTL (validUntil field) — reject and re-fetch if expired.",
    inputSchema: {
      type: "object",
      required: ["chainId", "amountIn", "tokenIn", "tokenOut"],
      properties: {
        chainId: chainIdSchema,
        amountIn: rawAmountSchema,
        tokenIn: addressSchema,
        tokenOut: addressSchema,
        maxSteps: maxStepsSchema,
        slippageBps: slippageBpsSchema,
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        amountIn: rawAmountSchema,
        amountOut: rawAmountSchema,
        fee: { type: "string", description: "Protocol fee in basis points." },
        affiliateFee: { type: "string", description: "Affiliate fee in basis points (0 if no affiliate)." },
        gasEstimate: { type: "string" },
        quoteId: { type: "string", format: "uuid" },
        timestamp: { type: "integer" },
        validUntil: { type: "integer", description: "Unix ms — reject quote after this time." },
        sdkVersion: { type: "string" },
      },
    },
    agentHints:
      "Always check tradeInfo.validUntil before building calldata. " +
      "If Date.now() > validUntil, call getTradeInfo again.",
  },

  swap: {
    name: "swap",
    description:
      "Legacy alias for prepareSwap: finds the best route, applies slippage, and returns the correct calldata. " +
      "Handles all swap types: WrapNative, UnwrapNative, NativeToERC20, ERC20ToNative, ERC20ToERC20. " +
      "Returns { tradeInfo, calldata: { to, data, value }, swapType }. " +
      "This does not broadcast a transaction; prefer prepareSwap for new integrations. " +
      "For ERC-20 input, call checkAllowance first and send approval if needed.",
    inputSchema: {
      type: "object",
      required: ["chainId", "amountIn", "tokenIn", "tokenOut", "toAddress"],
      properties: {
        chainId: chainIdSchema,
        amountIn: rawAmountSchema,
        tokenIn: addressSchema,
        tokenOut: addressSchema,
        toAddress: { ...addressSchema, description: "Recipient wallet address for output tokens." },
        maxSteps: maxStepsSchema,
        slippageBps: slippageBpsSchema,
      },
    },
    agentHints:
      "Prefer prepareSwap for new integrations; swap remains for backwards compatibility. " +
      "The swapType in the response tells you what kind of swap was performed. " +
      "Always present the tradeInfo to the user (amountIn, amountOut, fee) before executing.",
  },

  prepareSwap: {
    name: "prepareSwap",
    description:
      "Prepares a swap without broadcasting a transaction. " +
      "Finds the route, applies slippage, and returns { tradeInfo, calldata: { to, data, value }, swapType }. " +
      "Return the calldata to the caller, wallet, or signer for approval and execution.",
    inputSchema: {
      type: "object",
      required: ["chainId", "amountIn", "tokenIn", "tokenOut", "toAddress"],
      properties: {
        chainId: chainIdSchema,
        amountIn: rawAmountSchema,
        tokenIn: addressSchema,
        tokenOut: addressSchema,
        toAddress: { ...addressSchema, description: "Recipient wallet address for output tokens." },
        maxSteps: maxStepsSchema,
        slippageBps: slippageBpsSchema,
      },
    },
    agentHints:
      "Use prepareSwap for calldata-only agent workflows. " +
      "For ERC-20 input, check allowance first and prefer exact approval calldata for the amount being swapped.",
  },

  executeSwap: {
    name: "executeSwap",
    description:
      "Executes a swap with a router that was created from an intentionally authorized signer. " +
      "This broadcasts the prepared transaction and waits for the receipt. " +
      "Do not use this in read-only or user-custody flows; use prepareSwap instead.",
    inputSchema: {
      type: "object",
      required: ["chainId", "amountIn", "tokenIn", "tokenOut", "toAddress"],
      properties: {
        chainId: chainIdSchema,
        amountIn: rawAmountSchema,
        tokenIn: addressSchema,
        tokenOut: addressSchema,
        toAddress: { ...addressSchema, description: "Recipient wallet address for output tokens." },
        maxSteps: maxStepsSchema,
        slippageBps: slippageBpsSchema,
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        hash: { type: "string" },
        receipt: { type: "object" },
        tradeInfo: { type: "object" },
        calldata: { type: "object" },
        swapType: { type: "string" },
      },
    },
    agentHints:
      "Only call executeSwap when the application has deliberately granted the SDK signer authority. " +
      "For human wallets, return prepareSwap calldata to the wallet instead.",
  },

  checkAllowance: {
    name: "checkAllowance",
    description:
      "Checks whether ownerAddress has approved the router to spend at least requiredAmount of an ERC-20 token. " +
      "Call this before any ERC-20 input swap. If approved is false, prefer getApprovalCalldataForAmount with exact mode.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress", "ownerAddress", "requiredAmount"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        ownerAddress: addressSchema,
        requiredAmount: rawAmountSchema,
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        allowance: { type: "string", description: "Current allowance in raw units." },
      },
    },
  },

  getApprovalCalldata: {
    name: "getApprovalCalldata",
    description:
      "Legacy ERC-20 approval calldata helper for the router. Returns { to, data, value }. " +
      "Pass amount for exact approval; omitting amount builds unlimited approval for compatibility. " +
      "Agent integrations should prefer getApprovalCalldataForAmount with mode: exact.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        amount: { ...rawAmountSchema, description: "Approval amount. Omit for unlimited (MaxUint256)." },
      },
    },
  },

  getApprovalCalldataForAmount: {
    name: "getApprovalCalldataForAmount",
    description:
      "Builds ERC-20 approval calldata with an explicit approval mode. " +
      "Use mode: exact with the swap amount for automated wallets and agents; use mode: unlimited only when the caller explicitly accepts that allowance.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress", "mode"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        mode: {
          type: "string",
          enum: ["exact", "unlimited"],
          description: "Approval mode. exact requires amount; unlimited approves MaxUint256.",
        },
        amount: { ...rawAmountSchema, description: "Required when mode is exact. Ignored for unlimited approval." },
      },
    },
    agentHints:
      "For an ERC-20 swap amountIn, call getApprovalCalldataForAmount(tokenIn, { mode: 'exact', amount: amountIn }) when checkAllowance is false.",
  },

  // ── Affiliate ────────────────────────────────────────────────────────────────

  estimateAffiliateEarning: {
    name: "estimateAffiliateEarning",
    description:
      "Estimates how much the affiliate wallet will earn on a swap before it is executed. " +
      "Returns null if no affiliate is configured on this router. " +
      "Use this to show a fee breakdown to users or affiliates.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress", "rawAmountIn"],
      properties: {
        chainId: chainIdSchema,
        tokenAddress: addressSchema,
        rawAmountIn: rawAmountSchema,
      },
    },
    outputSchema: {
      type: "object",
      nullable: true,
      properties: {
        affiliateAddress: { type: "string" },
        affiliateAmountRaw: { type: "string" },
        affiliateAmountHuman: { type: "number" },
        affiliateFeeBps: { type: "integer" },
      },
    },
  },

  // ── Token helpers ────────────────────────────────────────────────────────────

  getTokenDecimals: {
    name: "getTokenDecimals",
    description:
      "Returns the decimal places for a token (e.g. 18 for ETH, 6 for USDC). " +
      "Use this to convert between human and raw amounts.",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress"],
      properties: { chainId: chainIdSchema, tokenAddress: addressSchema },
    },
    outputSchema: { type: "integer" },
  },

  getTokenSymbol: {
    name: "getTokenSymbol",
    description: "Returns the ticker symbol for a token address (e.g. 'USDC', 'WETH').",
    inputSchema: {
      type: "object",
      required: ["chainId", "tokenAddress"],
      properties: { chainId: chainIdSchema, tokenAddress: addressSchema },
    },
    outputSchema: { type: "string" },
  },
};

/**
 * Returns schemas formatted for OpenAI function calling API.
 *
 * @example
 * const tools = getOpenAITools();
 * // Pass to openai.chat.completions.create({ tools })
 */
export function getOpenAITools() {
  return Object.values(TOOL_SCHEMAS).map((schema) => ({
    type: "function" as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.inputSchema,
    },
  }));
}

/**
 * Returns schemas formatted for Anthropic Claude tool use.
 *
 * @example
 * const tools = getClaudeTools();
 * // Pass to anthropic.messages.create({ tools })
 */
export function getClaudeTools() {
  return Object.values(TOOL_SCHEMAS).map((schema) => ({
    name: schema.name,
    description: schema.description,
    input_schema: schema.inputSchema,
  }));
}

/**
 * Returns schemas formatted for LangChain StructuredTool.
 */
export function getLangChainSchemas() {
  return Object.values(TOOL_SCHEMAS).map((schema) => ({
    name: schema.name,
    description: schema.description,
    schema: schema.inputSchema,
  }));
}
