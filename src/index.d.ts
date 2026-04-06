// ─── empseal-router type declarations ────────────────────────────────────────

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
}

export interface AllowanceResult {
    approved:  boolean;
    allowance: string;
}

export interface CalldataResult {
    to: string;
    data: string;
    value: string;
}

export interface SwapResult {
    tradeInfo: TradeInfo;
    calldata: CalldataResult;
    swapType: "WrapNative" | "UnwrapNative" | "NativeToERC20" | "ERC20ToNative" | "ERC20ToERC20";
}

export interface QuoteUSDResult {
    usd: number;
    pricePerToken: number;
    decimals: number;
    humanAmount: number;
}

// ─── Router instance ──────────────────────────────────────────────────────────

export interface EmpSealRouter {
    chain: ChainConfig;
    provider: Provider;

    // Path finding
    findBestPath(amountIn: string | bigint, tokenIn: string, tokenOut: string, maxSteps?: number): Promise<PathResult>;
    getTradeInfo(
        amountIn: string | bigint,
        tokenIn: string,
        tokenOut: string,
        maxSteps?: number,
        slippageBps?: number
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
        amountIn: string | bigint,
        tokenIn: string,
        tokenOut: string,
        toAddress: string,
        maxSteps?: number,
        slippageBps?: number
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

export declare function createRouter(chainId: number, provider?: string | Provider): EmpSealRouter;

export declare function getChainConfig(chainId: number): ChainInfo;
export declare function getAllChains(): ChainInfo[];
export declare function getSupportedChainIds(): number[];
export declare function getProtocolFeeBps(): string;

export declare const CHAINS: Record<number, ChainConfig>;
export declare const BASE_ROUTER_ABI: object[];
export declare const PLS_ROUTER_ABI:  object[];
export declare const ETH_ROUTER_ABI:  object[];
export declare const ERC20_ABI: object[];
