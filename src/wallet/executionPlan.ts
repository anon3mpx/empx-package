import type { Provider, Signer } from "ethers";
import type {
  ApprovalAmountMode,
  CalldataResult,
  EmpxRouter,
  FeeResolutionContext,
  PermitSignature,
  SwapResult,
  TradeInfo,
} from "../types.js";
import { signPermit } from "../core/permit.js";
import {
  calldataToWalletCall,
  canSendWalletCalls,
  type Eip1193RequestProvider,
  type Eip5792Call,
} from "./eip5792.js";

export type WalletSwapExecutionStrategy =
  | "swap-only"
  | "permit"
  | "batch"
  | "approval-then-swap";

export interface WalletSwapPermitOptions {
  signer: Signer;
  provider?: Provider;
  tokenName?: string;
  tokenVersion?: string;
  nonce?: string | bigint;
  deadline?: string | bigint;
  deadlineSecondsFromNow?: number;
}

export interface PrepareWalletSwapOptions {
  router: EmpxRouter;
  account: string;
  amountIn: string | bigint;
  tokenIn: string;
  tokenOut: string;
  recipient: string;
  maxSteps?: number;
  slippageBps?: number;
  feeContext?: FeeResolutionContext;
  approvalMode?: ApprovalAmountMode;
  preferPermit?: boolean;
  permit?: WalletSwapPermitOptions;
  preferBatch?: boolean;
  eip1193Provider?: Eip1193RequestProvider;
}

export interface WalletSwapExecutionPlan {
  strategy: WalletSwapExecutionStrategy;
  tradeInfo: TradeInfo;
  swapType: SwapResult["swapType"];
  swap: CalldataResult;
  approval?: CalldataResult;
  permit?: PermitSignature;
  walletCalls?: Eip5792Call[];
  warnings: string[];
}

function toChainIdHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function isErc20Input(swapType: SwapResult["swapType"]): boolean {
  return swapType === "ERC20ToERC20" || swapType === "ERC20ToNative";
}

function defaultPermitDeadline(secondsFromNow = 1_800): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + secondsFromNow);
}

async function tryBuildPermitPlan(
  options: PrepareWalletSwapOptions,
  prepared: SwapResult,
  warnings: string[],
): Promise<{ permit: PermitSignature; swap: CalldataResult } | null> {
  if (!options.preferPermit) return null;
  if (!options.permit) {
    warnings.push("Permit was preferred but no permit signer/options were provided.");
    return null;
  }

  try {
    const deadline = options.permit.deadline
      ?? defaultPermitDeadline(options.permit.deadlineSecondsFromNow);
    const permit = await signPermit({
      signer: options.permit.signer,
      provider: options.permit.provider ?? options.router.provider,
      owner: options.account,
      spender: options.router.chain.ROUTER_ADDRESS,
      tokenAddress: options.tokenIn,
      value: options.amountIn,
      chainId: options.router.chain.chainId,
      deadline,
      tokenName: options.permit.tokenName,
      tokenVersion: options.permit.tokenVersion,
      nonce: options.permit.nonce,
    });

    const swap = prepared.swapType === "ERC20ToNative"
      ? options.router.getSwapToNativeWithPermitCalldata(prepared.tradeInfo, options.recipient, permit)
      : options.router.getSwapWithPermitCalldata(prepared.tradeInfo, options.recipient, permit);
    return { permit, swap };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Permit flow unavailable; falling back to approval flow: ${message}`);
    return null;
  }
}

export async function prepareWalletSwap(
  options: PrepareWalletSwapOptions,
): Promise<WalletSwapExecutionPlan> {
  const warnings: string[] = [];
  const prepared = await options.router.prepareSwap(
    options.amountIn,
    options.tokenIn,
    options.tokenOut,
    options.recipient,
    options.maxSteps,
    options.slippageBps,
    options.feeContext,
  );

  if (!isErc20Input(prepared.swapType)) {
    return {
      strategy: "swap-only",
      tradeInfo: prepared.tradeInfo,
      swapType: prepared.swapType,
      swap: prepared.calldata,
      warnings,
    };
  }

  const allowance = await options.router.checkAllowance(
    options.tokenIn,
    options.account,
    options.amountIn,
  );
  if (allowance.approved) {
    return {
      strategy: "swap-only",
      tradeInfo: prepared.tradeInfo,
      swapType: prepared.swapType,
      swap: prepared.calldata,
      warnings,
    };
  }

  const permitPlan = await tryBuildPermitPlan(options, prepared, warnings);
  if (permitPlan) {
    return {
      strategy: "permit",
      tradeInfo: prepared.tradeInfo,
      swapType: prepared.swapType,
      swap: permitPlan.swap,
      permit: permitPlan.permit,
      warnings,
    };
  }

  const approval = options.router.getApprovalCalldataForAmount(options.tokenIn, {
    mode: options.approvalMode ?? "exact",
    amount: options.amountIn,
  });

  if (options.preferBatch && options.eip1193Provider) {
    const chainIdHex = toChainIdHex(options.router.chain.chainId);
    const canBatch = await canSendWalletCalls(options.eip1193Provider, options.account, chainIdHex);
    if (canBatch) {
      return {
        strategy: "batch",
        tradeInfo: prepared.tradeInfo,
        swapType: prepared.swapType,
        swap: prepared.calldata,
        approval,
        walletCalls: [
          calldataToWalletCall(approval),
          calldataToWalletCall(prepared.calldata),
        ],
        warnings,
      };
    }
    warnings.push("Wallet does not support wallet_sendCalls batching on this chain.");
  } else if (options.preferBatch) {
    warnings.push("Batching was preferred but no EIP-1193 provider was provided.");
  }

  return {
    strategy: "approval-then-swap",
    tradeInfo: prepared.tradeInfo,
    swapType: prepared.swapType,
    swap: prepared.calldata,
    approval,
    warnings,
  };
}
