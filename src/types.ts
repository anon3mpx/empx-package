import type { Provider, Signer } from "ethers";

export interface NativeCurrency { name: string; symbol: string; decimals: number; }
export interface NativeSwapFns { fromNative: string; toNative: string; }

export interface ChainInfo {
  chainId: number; name: string; nativeSwapFns: NativeSwapFns;
  nativeCurrency: NativeCurrency; rpcUrl: string;
  ROUTER_ADDRESS: string; NATIVE_ADDRESS: string; WRAPPED_NATIVE: string;
  USD_STABLE: string; USD_STABLE_DECIMALS: number;
  STABLE_TOKENS: string[]; TRUSTED_TOKENS: string[]; ADAPTERS: string[];
  /** EmpsealMulticallRouter address — only populated where deployed.
   *  Required for split routing.  When absent, the SDK falls back to
   *  single-route quotes for that chain. */
  MULTICALL_ROUTER_ADDRESS?: string;
}

export interface ChainConfig extends ChainInfo { routerAbi: object[]; }

export interface PathResult {
  amounts: string[]; path: string[]; adapters: string[]; gasEstimate: string;
}

export interface TradeInfo {
  amountIn: string; amountOut: string; fee: string;
  affiliateFee: string; totalFeeBps: string;
  amounts: string[]; path: string[]; adapters: string[];
  gasEstimate: string; quoteId: string; timestamp: number;
  validUntil: number; sdkVersion: string;
  integratorId?: string;
}

export interface AllowanceResult { approved: boolean; allowance: string; }
export interface CalldataResult { to: string; data: string; value: string; }
export interface PermitSignature { deadline: string | bigint; v: number; r: string; s: string; }
export type ApprovalAmountMode = "exact" | "unlimited";
export interface ApprovalCalldataOptions { mode?: ApprovalAmountMode; amount?: string | bigint; }
export type SwapType = "WrapNative" | "UnwrapNative" | "NativeToERC20" | "ERC20ToNative" | "ERC20ToERC20";
export interface SwapResult { tradeInfo: TradeInfo; calldata: CalldataResult; swapType: SwapType; }
export interface ExecuteSwapResult extends SwapResult { hash: string; receipt: unknown; }
export interface QuoteUSDResult { usd: number; pricePerToken: number; decimals: number; humanAmount: number; }

export interface AffiliateConfig { address: string; feeBps: number; }
export interface AffiliateEarning {
  affiliateAddress: string; affiliateAmountRaw: string;
  affiliateAmountHuman: number; affiliateFeeBps: number;
}

export type ProviderInput = string | string[] | Provider | Signer;

export interface RouterConfig {
  integratorId?: string;
  affiliate?: AffiliateConfig;
  protocolFeeBps?: string | number | bigint;
  pairTypeFees?: false | Partial<{
    volatileVolatileBps: number;
    volatileStableBps: number;
    stableStableBps: number;
  }>;
}

export interface BatchRouterConfig extends RouterConfig {
  /** Per-chain provider input. Missing chains use the chain registry default RPC. */
  providers?: Partial<Record<number, ProviderInput>>;
  /** Optional shared provider for advanced use; prefer per-chain providers. */
  defaultProvider?: ProviderInput;
}

export const ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  INVALID_CHAIN: "INVALID_CHAIN",
  SLIPPAGE_TOO_HIGH: "SLIPPAGE_TOO_HIGH",
  STEPS_OUT_OF_RANGE: "STEPS_OUT_OF_RANGE",
  INVALID_AFFILIATE: "INVALID_AFFILIATE",
  AMOUNT_TOO_SMALL: "AMOUNT_TOO_SMALL",
  INSUFFICIENT_LIQUIDITY: "INSUFFICIENT_LIQUIDITY",
  NO_ROUTE_FOUND: "NO_ROUTE_FOUND",
  QUOTE_EXPIRED: "QUOTE_EXPIRED",
  RPC_ERROR: "RPC_ERROR",
  PRICE_FETCH_FAILED: "PRICE_FETCH_FAILED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface EmpxErrorJSON {
  error: { code: ErrorCode; message: string; retryable: boolean; context: Record<string, unknown>; };
}

export interface ToolSchema {
  name: string; description: string; inputSchema: object; outputSchema?: object;
}

export type WalletType = "burner" | "privateKey" | "mnemonic" | "metamask" | "rabby" | "walletConnect" | "privy" | "wagmi" | "injected" | "readonly";

export interface WalletInfo {
  type: WalletType; address: string; isAgentWallet: boolean; isHumanWallet: boolean;
  mnemonic?: string; privateKey?: string; signer: Signer | null; provider: Provider;
}

export interface BurnerWalletOptions { mnemonic?: string; derivationPath?: string; rpcUrl?: string; }
export interface PrivateKeyWalletOptions { privateKey: string; rpcUrl?: string; }
export interface MnemonicWalletOptions { mnemonic: string; derivationPath?: string; rpcUrl?: string; }

export interface FeeResolutionContext {
  pairType?: "V/V" | "V/S" | "S/S";
  tokenInIsStable?: boolean;
  tokenOutIsStable?: boolean;
  /** @deprecated Prefer tokenInIsStable + tokenOutIsStable for V/S accuracy. */
  isStablePair?: boolean;
  /** Reserved for future volume-overlay; not used by default resolver. */
  amountInUSD?: number;
}

export interface FeeBreakdown {
  protocolFeeBps: string;
  affiliateFeeBps: string;
  affiliateAbsoluteBps: string;
  totalFeeBps: string;
}

export interface EmpxRouter {
  chain: ChainInfo; provider: Provider; affiliate: AffiliateConfig | undefined;
  isSplitAvailable(): boolean;
  findBestPath(amountIn: string | bigint, tokenIn: string, tokenOut: string, maxSteps?: number): Promise<PathResult>;
  getTradeInfo(amountIn: string | bigint, tokenIn: string, tokenOut: string, maxSteps?: number, slippageBps?: number, feeContext?: FeeResolutionContext): Promise<TradeInfo>;
  checkAllowance(tokenAddress: string, ownerAddress: string, requiredAmount: string | bigint): Promise<AllowanceResult>;
  getSwapCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
  getSwapFromNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
  getSwapToNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult;
  getSwapWithPermitCalldata(tradeInfo: TradeInfo, toAddress: string, permit: PermitSignature): CalldataResult;
  getSwapToNativeWithPermitCalldata(tradeInfo: TradeInfo, toAddress: string, permit: PermitSignature): CalldataResult;
  getWrapCalldata(tradeInfo: Pick<TradeInfo, "amountIn">): CalldataResult;
  getUnwrapCalldata(tradeInfo: Pick<TradeInfo, "amountIn">): CalldataResult;
  getApprovalCalldata(tokenAddress: string, amount?: string | bigint): CalldataResult;
  getApprovalCalldataForAmount(tokenAddress: string, options: ApprovalCalldataOptions): CalldataResult;
  swap(amountIn: string | bigint, tokenIn: string, tokenOut: string, toAddress: string, maxSteps?: number, slippageBps?: number, feeContext?: FeeResolutionContext): Promise<SwapResult>;
  prepareSwap(amountIn: string | bigint, tokenIn: string, tokenOut: string, toAddress: string, maxSteps?: number, slippageBps?: number, feeContext?: FeeResolutionContext): Promise<SwapResult>;
  executeSwap(amountIn: string | bigint, tokenIn: string, tokenOut: string, toAddress: string, maxSteps?: number, slippageBps?: number, feeContext?: FeeResolutionContext): Promise<ExecuteSwapResult>;
  getTokenPriceUSD(tokenAddress: string, maxSteps?: number): Promise<number>;
  getQuoteUSD(tokenAddress: string, rawAmount: string | bigint, maxSteps?: number): Promise<QuoteUSDResult>;
  getMultipleTokenPricesUSD(tokenAddresses: string[], maxSteps?: number): Promise<Record<string, number>>;
  getTokenDecimals(tokenAddress: string): Promise<number>;
  getTokenSymbol(tokenAddress: string): Promise<string>;
  estimateAffiliateEarning(tokenAddress: string, rawAmountIn: string | bigint): Promise<AffiliateEarning | null>;
  integratorId?: string;
}
