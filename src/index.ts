// ─── empx-swap-sdk ────────────────────────────────────────────────────────────
// Multi-chain DEX swap SDK — TypeScript-native, AI-first, dual affiliate model

// ─── Primary API ──────────────────────────────────────────────────────────────

export {
  createRouter,
  createAffiliateRouter,
  createRouters,
  getAllChainRouters,
} from "./router.js";

// ─── Wallet connectivity ──────────────────────────────────────────────────────

export {
  createBurnerWallet,
  fromPrivateKey,
  fromMnemonic,
  connectMetaMask,
  connectRabby,
  connectInjected,
  connectPrivy,
  connectWagmi,
  readOnly,
  describeWallet,
  getNativeBalance,
} from "./wallet.js";

export {
  discoverInjectedProviders,
  getInjectedProviderByRdns,
  connectViaEip6963,
  KNOWN_WALLET_RDNS,
} from "./wallet/eip6963.js";
export type {
  Eip6963ProviderInfo,
  Eip6963ProviderDetail,
} from "./wallet/eip6963.js";

export {
  calldataToWalletCall,
  canSendWalletCalls,
  getWalletCapabilities,
  parseWalletCapabilities,
  sendWalletCalls,
} from "./wallet/eip5792.js";
export type {
  Eip5792Call,
  Eip5792SendCallsParams,
  Eip1193RequestProvider,
  WalletCapabilitiesSummary,
} from "./wallet/eip5792.js";

export {
  prepareWalletSwap,
} from "./wallet/executionPlan.js";
export type {
  PrepareWalletSwapOptions,
  WalletSwapExecutionPlan,
  WalletSwapExecutionStrategy,
  WalletSwapPermitOptions,
} from "./wallet/executionPlan.js";

// ─── x402 RPC adapter ─────────────────────────────────────────────────────────

export {
  createX402Provider,
  PRESET_X402_ENDPOINTS,
} from "./wallet/x402Provider.js";
export type {
  CreateX402ProviderOptions,
  PaymentRequirement,
  PaymentPayload,
} from "./wallet/x402Provider.js";

// ─── Chain registry ───────────────────────────────────────────────────────────

export {
  getChainConfig,
  getAllChains,
  getSupportedChainIds,
  CHAIN_IDS,
  CHAINS,
  stripRouterAbi,
} from "./chains/index.js";

// ─── Fee management ───────────────────────────────────────────────────────────

export {
  getProtocolFeeBps,
  setProtocolFeeBps,
  applyProtocolFee,
  calculateAffiliateAmount,
  affiliateAbsoluteBps,
  buildFeeBreakdown,
  DEFAULT_PROTOCOL_FEE_BPS,
  MIN_PROTOCOL_FEE_BPS,
} from "./core/fees.js";

// ─── Pair-type fees (opt-in) ──────────────────────────────────────────────────

export {
  enablePairTypeFees,
  disablePairTypeFees,
  isPairTypeFeesEnabled,
  getPairTypeConfig,
  resolveTieredFeeBps,
  classifyPair,
  isStableToken,
  DEFAULT_PAIR_TYPE_FEES,
  enableTieredFees,
  disableTieredFees,
  isTieredFeesEnabled,
  getTieredFeeConfig,
  DEFAULT_FEE_TIERS,
  DEFAULT_STABLE_DISCOUNT_BPS,
} from "./core/feeTiers.js";
export type {
  PairType,
  PairTypeFeeConfig,
  ChainStableInfo,
  FeeResolutionContext,
  FeeTier,
  TieredFeeConfig,
} from "./core/feeTiers.js";

// ─── Affiliate share tiers ────────────────────────────────────────────────────

export {
  makeAffiliateConfig,
  classifyAffiliateTier,
  AFFILIATE_TIER_BPS,
  AFFILIATE_TIER_LABEL,
  AFFILIATE_TIER_ELIGIBILITY,
} from "./core/affiliateTiers.js";
export type { AffiliateTier } from "./core/affiliateTiers.js";

// ─── Agent / AI compatibility ─────────────────────────────────────────────────

export {
  TOOL_SCHEMAS,
  getOpenAITools,
  getClaudeTools,
  getLangChainSchemas,
} from "./agent/schemas.js";

// ─── Structured errors ────────────────────────────────────────────────────────

export { EmpxError } from "./core/errors.js";
export { ERROR_CODES } from "./types.js";

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export {
  BASE_ROUTER_ABI,
  PLS_ROUTER_ABI,
  ETH_ROUTER_ABI,
  BASE_INTEGRATOR_ROUTER_ABI,
  PLS_INTEGRATOR_ROUTER_ABI,
  ETH_INTEGRATOR_ROUTER_ABI,
  ERC20_ABI,
} from "./core/abi.js";

// ─── Validators ──────────────────────────────────────────────────────────────

export {
  validateTradeParams,
  validateAffiliateConfig,
  assertQuoteNotExpired,
  isValidAddress,
  isPositiveBigInt,
} from "./core/validators.js";

export {
  getApprovalCalldataForAmount,
  getSwapWithPermitCalldata,
  getSwapToNativeWithPermitCalldata,
} from "./core/calldata.js";

export {
  buildPermitTypedData,
  readPermitMetadata,
  signPermit,
  splitPermitSignature,
} from "./core/permit.js";
export type {
  PermitMetadata,
  PermitMetadataInput,
  PermitTypedDataInput,
  SignPermitInput,
} from "./core/permit.js";

export { toViemTransaction } from "./adapters/viem.js";
export type {
  ViemWalletClientLike,
  ViemTransactionRequest,
} from "./adapters/viem.js";

export { toWagmiTransaction } from "./adapters/wagmi.js";
export type { WagmiTransactionRequest } from "./adapters/wagmi.js";

// ─── Split routing (Phase 1 — opt-in, additive) ──────────────────────────────

export { findBestSplitRouting } from "./core/splitSolver.js";
export type {
  SplitLeg, SplitResult, SplitSolverOptions,
} from "./core/splitSolver.js";

export {
  buildSplitMultiSwapCalldata,
  buildSplitAggregateTradeInfo,
  pickSwapKind,
  SwapKind,
  SplitCalldataError,
} from "./core/splitCalldata.js";
export type {
  SwapKindValue,
  SplitLegTrade,
  BuildSplitCalldataInput,
} from "./core/splitCalldata.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  NativeCurrency,
  NativeSwapFns,
  ChainInfo,
  ChainConfig,
  PathResult,
  TradeInfo,
  AllowanceResult,
  CalldataResult,
  PermitSignature,
  ApprovalAmountMode,
  ApprovalCalldataOptions,
  SwapType,
  SwapResult,
  QuoteUSDResult,
  AffiliateConfig,
  AffiliateEarning,
  ProviderInput,
  RouterConfig,
  BatchRouterConfig,
  EmpxRouter,
  WalletType,
  WalletInfo,
  BurnerWalletOptions,
  PrivateKeyWalletOptions,
  MnemonicWalletOptions,
  ErrorCode,
  EmpxErrorJSON,
  ToolSchema,
} from "./types.js";
