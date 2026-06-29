// ─── Calldata Builders ────────────────────────────────────────────────────────
import { ethers, isAddress } from "ethers";
import type {
  ApprovalCalldataOptions,
  ChainConfig,
  TradeInfo,
  CalldataResult,
  PermitSignature,
} from "../types.js";
import { ERC20_ABI, PLS_INTEGRATOR_ROUTER_ABI, ETH_INTEGRATOR_ROUTER_ABI } from "./abi.js";

function validateAddress(address: string, name: string): void {
  if (!isAddress(address)) {
    throw new Error(`Invalid ${name}: "${address}" is not a valid Ethereum address`);
  }
}

function validateTradeInfo(trade: Partial<TradeInfo>): void {
  if (!trade || typeof trade !== "object") throw new Error("tradeInfo must be an object");
  if (trade.amountIn == null) throw new Error("tradeInfo.amountIn is required");
  if (trade.amountOut == null) throw new Error("tradeInfo.amountOut is required");
  if (!Array.isArray(trade.path) || trade.path.length < 2)
    throw new Error("tradeInfo.path must be an array with at least 2 addresses");
  if (!Array.isArray(trade.adapters) || trade.adapters.length < 1)
    throw new Error("tradeInfo.adapters must be a non-empty array");
}

function validateChainConfig(chainConfig: Partial<ChainConfig>): void {
  if (!chainConfig?.routerAbi) throw new Error("chainConfig.routerAbi is required");
  if (!chainConfig?.nativeSwapFns) throw new Error("chainConfig.nativeSwapFns is required");
  if (!chainConfig?.ROUTER_ADDRESS) throw new Error("chainConfig.ROUTER_ADDRESS is required");
}

function resolveIntegratorRouterAbi(chainConfig: ChainConfig): object[] {
  validateChainConfig(chainConfig);
  return chainConfig.nativeSwapFns.fromNative === "swapNoSplitFromPLS"
    ? PLS_INTEGRATOR_ROUTER_ABI
    : ETH_INTEGRATOR_ROUTER_ABI;
}

function encodeCalldata(
  abi: object[], address: string, funcName: string,
  args: unknown[], value = "0"
): CalldataResult {
  const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
  const data = iface.encodeFunctionData(funcName, args);
  return { to: address, data, value: value.toString() };
}

function buildTradeStruct(trade: TradeInfo): [bigint, bigint, string[], string[]] {
  return [BigInt(trade.amountIn), BigInt(trade.amountOut), trade.path, trade.adapters];
}

// ─── Standard calldata (no integrator) ─────────────────────────────────────────

export function getSwapCalldata(
  tradeInfo: TradeInfo, toAddress: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");
  validateChainConfig(chainConfig);

  return encodeCalldata(
    chainConfig.routerAbi, chainConfig.ROUTER_ADDRESS, "swapNoSplit",
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps)]
  );
}

export function getSwapFromNativeCalldata(
  tradeInfo: TradeInfo, toAddress: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");
  validateChainConfig(chainConfig);

  return encodeCalldata(
    chainConfig.routerAbi, chainConfig.ROUTER_ADDRESS,
    chainConfig.nativeSwapFns.fromNative,
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps)],
    tradeInfo.amountIn
  );
}

export function getSwapToNativeCalldata(
  tradeInfo: TradeInfo, toAddress: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");
  validateChainConfig(chainConfig);

  return encodeCalldata(
    chainConfig.routerAbi, chainConfig.ROUTER_ADDRESS,
    chainConfig.nativeSwapFns.toNative,
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps)]
  );
}

function resolveToNativePermitFunction(chainConfig: ChainConfig): string {
  const preferred = `${chainConfig.nativeSwapFns.toNative}WithPermit`;
  const names = new Set(
    chainConfig.routerAbi
      .filter((entry: any) => entry?.type === "function")
      .map((entry: any) => entry.name)
  );
  if (names.has(preferred)) return preferred;
  if (names.has("swapNoSplitToETHWithPermit")) return "swapNoSplitToETHWithPermit";
  throw new Error(`chainConfig for ${chainConfig.name} is missing swap-to-native permit function`);
}

export function getSwapWithPermitCalldata(
  tradeInfo: TradeInfo,
  toAddress: string,
  chainConfig: ChainConfig,
  feeBps: string,
  permit: PermitSignature
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");
  validateChainConfig(chainConfig);

  return encodeCalldata(
    chainConfig.routerAbi, chainConfig.ROUTER_ADDRESS, "swapNoSplitWithPermit",
    [
      buildTradeStruct(tradeInfo),
      toAddress,
      BigInt(feeBps),
      BigInt(permit.deadline),
      permit.v,
      permit.r,
      permit.s,
    ]
  );
}

export function getSwapToNativeWithPermitCalldata(
  tradeInfo: TradeInfo,
  toAddress: string,
  chainConfig: ChainConfig,
  feeBps: string,
  permit: PermitSignature
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");
  validateChainConfig(chainConfig);

  return encodeCalldata(
    chainConfig.routerAbi, chainConfig.ROUTER_ADDRESS, resolveToNativePermitFunction(chainConfig),
    [
      buildTradeStruct(tradeInfo),
      toAddress,
      BigInt(feeBps),
      BigInt(permit.deadline),
      permit.v,
      permit.r,
      permit.s,
    ]
  );
}

// ─── Affiliate / Integrator calldata (on-chain _integratorId) ──────────────────

export function getAffiliateSwapCalldata(
  tradeInfo: TradeInfo, toAddress: string,
  integratorId: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");

  return encodeCalldata(
    resolveIntegratorRouterAbi(chainConfig), chainConfig.ROUTER_ADDRESS,
    "swapNoSplit",
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps), integratorId]
  );
}

export function getAffiliateSwapFromNativeCalldata(
  tradeInfo: TradeInfo, toAddress: string,
  integratorId: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");

  return encodeCalldata(
    resolveIntegratorRouterAbi(chainConfig), chainConfig.ROUTER_ADDRESS,
    chainConfig.nativeSwapFns.fromNative,
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps), integratorId],
    tradeInfo.amountIn
  );
}

export function getAffiliateSwapToNativeCalldata(
  tradeInfo: TradeInfo, toAddress: string,
  integratorId: string, chainConfig: ChainConfig, feeBps: string
): CalldataResult {
  validateTradeInfo(tradeInfo);
  validateAddress(toAddress, "toAddress");

  return encodeCalldata(
    resolveIntegratorRouterAbi(chainConfig), chainConfig.ROUTER_ADDRESS,
    chainConfig.nativeSwapFns.toNative,
    [buildTradeStruct(tradeInfo), toAddress, BigInt(feeBps), integratorId]
  );
}

// ─── Wrap / Unwrap ────────────────────────────────────────────────────────────

export function getWrapCalldata(
  tradeInfo: Pick<TradeInfo, "amountIn">, wrappedAddr: string
): CalldataResult {
  validateAddress(wrappedAddr, "wrappedAddr");
  if (tradeInfo?.amountIn == null) throw new Error("tradeInfo.amountIn is required");
  return encodeCalldata(ERC20_ABI, wrappedAddr, "deposit", [], tradeInfo.amountIn);
}

export function getUnwrapCalldata(
  tradeInfo: Pick<TradeInfo, "amountIn">, wrappedAddr: string
): CalldataResult {
  validateAddress(wrappedAddr, "wrappedAddr");
  if (tradeInfo?.amountIn == null) throw new Error("tradeInfo.amountIn is required");
  return encodeCalldata(ERC20_ABI, wrappedAddr, "withdraw", [BigInt(tradeInfo.amountIn)]);
}

// ─── ERC-20 Approval ─────────────────────────────────────────────────────────

export function getApprovalCalldata(
  tokenAddress: string, spenderAddress: string, amount?: string | bigint
): CalldataResult {
  validateAddress(tokenAddress, "tokenAddress");
  validateAddress(spenderAddress, "spenderAddress");
  const approvalAmount = amount != null ? BigInt(amount) : ethers.MaxUint256;
  return encodeCalldata(ERC20_ABI, tokenAddress, "approve", [spenderAddress, approvalAmount]);
}

export function getApprovalCalldataForAmount(
  tokenAddress: string,
  spenderAddress: string,
  options: ApprovalCalldataOptions
): CalldataResult {
  validateAddress(tokenAddress, "tokenAddress");
  validateAddress(spenderAddress, "spenderAddress");
  const mode = options.mode ?? "exact";
  if (mode === "exact" && options.amount == null) {
    throw new Error("Exact approval requires an amount");
  }
  const approvalAmount = mode === "unlimited" ? ethers.MaxUint256 : BigInt(options.amount!);
  return encodeCalldata(ERC20_ABI, tokenAddress, "approve", [spenderAddress, approvalAmount]);
}
