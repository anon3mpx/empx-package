// ─── empx-swap-sdk-beta type declarations ───────────────────────────────────────────────

import { Provider } from "ethers";

// ─── Chain info/config ────────────────────────────────────────────────────────

export interface NativeCurrency {
    name: string;
    symbol: string;
    decimals: number;
}

export interface ChainInfo {
    chainId: number;
    name: string;
    nativeCurrency: NativeCurrency;
    rpcUrl: string;
    ROUTER_ADDRESS: string;
    NATIVE_ADDRESS: string;
    WRAPPED_NATIVE: string;
    STABLE_TOKENS: string[];
    TRUSTED_TOKENS: string[];
    ADAPTERS: string[];
    /** Chain-specific native swap function names */
    nativeSwapFns: {
        fromNative: string; // "swapNoSplitFromPLS" | "swapNoSplitFromETH"
        toNative:   string; // "swapNoSplitToPLS"   | "swapNoSplitToETH"
    };
}

export interface ChainConfig extends ChainInfo {
    /** The full router ABI for this chain (PLS_ROUTER_ABI or ETH_ROUTER_ABI) */
    routerAbi: object[];
}

// ─── Trade types ──────────────────────────────────────────────────────────────

export interface PathResult {
    amounts:     string[];
    path:        string[];
    adapters:    string[];
    gasEstimate: string;
}

export interface TradeInfo {
    amountIn:    string;
    amountOut:   string;
    fee:         string;
    amounts:     string[];
    path:        string[];
    adapters:    string[];
    gasEstimate: string;
    /** Unique quote ID for traceability and logging. */
    quoteId:     string;
    /** Unix millisecond timestamp when the quote was computed. */
    timestamp:   number;
    /** Unix millisecond timestamp after which this quote should be considered stale (30s TTL). */
    validUntil:  number;
    /** empx-swap-sdk-beta version that produced this quote. */
    sdkVersion:  string;
}

export interface AllowanceResult {
    approved:  boolean;
    allowance: string;
}

export interface CalldataResult {
    to:    string;
    data:  string;
    value: string;
}

export type SwapType = "WrapNative" | "UnwrapNative" | "NativeToERC20" | "ERC20ToNative" | "ERC20ToERC20";

export interface SwapResult {
    tradeInfo: TradeInfo;
    calldata:  CalldataResult;
    swapType:  SwapType;
}

export interface QuoteUSDResult {
    usd:           number;
    pricePerToken: number;
    decimals:      number;
    humanAmount:   number;
}

// ─── Structured errors ────────────────────────────────────────────────────────

export declare const ERROR_CODES: {
    INVALID_INPUT:          "INVALID_INPUT";
    INVALID_ADDRESS:        "INVALID_ADDRESS";
    INVALID_AMOUNT:         "INVALID_AMOUNT";
    INVALID_CHAIN:          "INVALID_CHAIN";
    SLIPPAGE_TOO_HIGH:      "SLIPPAGE_TOO_HIGH";
    STEPS_OUT_OF_RANGE:     "STEPS_OUT_OF_RANGE";
    AMOUNT_TOO_SMALL:       "AMOUNT_TOO_SMALL";
    INSUFFICIENT_LIQUIDITY: "INSUFFICIENT_LIQUIDITY";
    NO_ROUTE_FOUND:         "NO_ROUTE_FOUND";
    QUOTE_EXPIRED:          "QUOTE_EXPIRED";
    RPC_ERROR:              "RPC_ERROR";
    PRICE_FETCH_FAILED:     "PRICE_FETCH_FAILED";
};

export declare class EmpxError extends Error {
    code:      keyof typeof ERROR_CODES;
    retryable: boolean;
    context:   object;
    constructor(code: string, message: string, retryable?: boolean, context?: object);
    toJSON(): { error: { code: string; message: string; retryable: boolean; context: object } };
}

// ─── Agent schemas ────────────────────────────────────────────────────────────

export interface ToolSchema {
    name:         string;
    description:  string;
    inputSchema:  object;
    outputSchema?: object;
}

export declare const TOOL_SCHEMAS: Record<string, ToolSchema>;

// ─── Router instance ──────────────────────────────────────────────────────────

export interface EmpxRouter {
    chain:    ChainInfo;
    provider: Provider;

    // Path finding
    findBestPath(amountIn: string | bigint, tokenIn: string, tokenOut: string, maxSteps?: number): Promise<PathResult>;
    getTradeInfo(
        amountIn:     string | bigint,
        tokenIn:      string,
        tokenOut:     string,
        maxSteps?:    number,
        slippageBps?: number,
    ): Promise<TradeInfo>;

    // Allowance
    checkAllowance(tokenAddress: string, ownerAddress: string, requiredAmount: string | bigint): Promise<AllowanceResult>;

    // Calldata builders
    getSwapCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
    getSwapFromNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
    getSwapToNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
    getWrapCalldata(tradeInfo: Pick<TradeInfo, "amountIn">): CalldataResult;
    getUnwrapCalldata(tradeInfo: Pick<TradeInfo, "amountIn">): CalldataResult;
    getApprovalCalldata(tokenAddress: string, amount?: string | bigint): CalldataResult;

    // All-in-one swap
    swap(
        amountIn:     string | bigint,
        tokenIn:      string,
        tokenOut:     string,
        toAddress:    string,
        maxSteps?:    number,
        slippageBps?: number,
    ): Promise<SwapResult>;

    // Price quotes
    getTokenPriceUSD(tokenAddress: string, maxSteps?: number): Promise<number>;
    getQuoteUSD(tokenAddress: string, rawAmount: string | bigint, maxSteps?: number): Promise<QuoteUSDResult>;
    getMultipleTokenPricesUSD(tokenAddresses: string[], maxSteps?: number): Promise<Record<string, number>>;

    // Token helpers
    getTokenDecimals(tokenAddress: string): Promise<number>;
    getTokenSymbol(tokenAddress: string): Promise<string>;
}

// ─── Chain IDs ────────────────────────────────────────────────────────────────

export declare const CHAIN_IDS: {
    PULSECHAIN: 369;
    BSC:        56;
    ARBITRUM:   42161;
    BASE:       8453;
    POLYGON:    137;
    AVALANCHE:  43114;
    OPTIMISM:   10;
    MONAD:      143;
    SONIC:      146;
    SEI:        1329;
    BERACHAIN:  80094;
    ROOTSTOCK:  30;
    HYPEREVM:   999;
    ETHW:       10001;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export declare function createRouter(
    chainId:   number,
    provider?: string | Provider,
): EmpxRouter;

export declare function getChainConfig(chainId: number): ChainInfo;
export declare function getAllChains(): ChainInfo[];
export declare function getSupportedChainIds(): number[];
export declare function getProtocolFeeBps(): string;

export declare const CHAINS:          Record<number, ChainConfig>;
export declare const BASE_ROUTER_ABI: object[];
export declare const PLS_ROUTER_ABI:  object[];
export declare const ETH_ROUTER_ABI:  object[];
export declare const ERC20_ABI:       object[];
