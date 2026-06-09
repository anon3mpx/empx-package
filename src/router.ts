// ─── Router Factory ───────────────────────────────────────────────────────────
import { ethers } from "ethers";
import type { Provider } from "ethers";
import type {
  EmpxRouter, ChainInfo, TradeInfo, PathResult, AllowanceResult,
  CalldataResult, SwapResult, QuoteUSDResult, AffiliateConfig,
  AffiliateEarning, RouterConfig, FeeResolutionContext,
} from "./types.js";
import { ERROR_CODES } from "./types.js";
import { getChainConfig, stripRouterAbi } from "./chains/index.js";
import { findBestPath } from "./core/pathfinder.js";
import {
  getProtocolFeeBps, applyProtocolFee as applyFee,
  calculateAffiliateAmount, affiliateAbsoluteBps,
} from "./core/fees.js";
import { resolveTieredFeeBps, isStableToken, isPairTypeFeesEnabled } from "./core/feeTiers.js";
import {
  getSwapCalldata, getSwapFromNativeCalldata, getSwapToNativeCalldata,
  getAffiliateSwapCalldata, getAffiliateSwapFromNativeCalldata,
  getAffiliateSwapToNativeCalldata,
  getWrapCalldata, getUnwrapCalldata, getApprovalCalldata,
} from "./core/calldata.js";
import {
  getTokenPriceUSD, getQuoteUSD, getMultipleTokenPricesUSD,
  getTokenDecimals, getTokenSymbol,
} from "./core/quotes.js";
import { ERC20_ABI } from "./core/abi.js";
import { EmpxError } from "./core/errors.js";
import {
  validateTradeParams, validateAffiliateConfig,
  assertQuoteNotExpired, isValidAddress,
} from "./core/validators.js";

const SDK_VERSION = "2.0.0";
const QUOTE_TTL_MS = 30_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hasTokenCycle(path: string[]): boolean {
  const seen = new Set<string>();
  for (const token of path) {
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
}

function validateIntegratorId(integratorId: string): void {
  if (typeof integratorId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(integratorId)) {
    throw new EmpxError(
      ERROR_CODES.INVALID_INPUT,
      `integratorId must be a bytes32 hex string, got: ${integratorId}`,
      false, { integratorId }
    );
  }
}

// ─── createRouter ──────────────────────────────────────────────────────────────

export function createRouter(
  chainId: number,
  provider?: string | Provider | ethers.Signer,
  config: RouterConfig = {}
): EmpxRouter {
  // Validate config
  if (config.integratorId) {
    validateIntegratorId(config.integratorId);
  }
  if (config.affiliate) {
    validateAffiliateConfig(config.affiliate);
  }

  const chainConfig = getChainConfig(chainId, config.integratorId);
  const chainInfo: ChainInfo = stripRouterAbi(chainConfig);
  const integratorId: string | undefined = config.integratorId;
  const affiliateConfig: AffiliateConfig | undefined = config.affiliate;

  // ─── Resolve provider ────────────────────────────────────────────────────────
  let _provider: Provider;
  let _signer: ethers.Signer | undefined;

  if (!provider) {
    _provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  } else if (typeof provider === "string") {
    _provider = new ethers.JsonRpcProvider(provider);
  } else if (provider instanceof ethers.AbstractSigner) {
    _signer = provider as ethers.Signer;
    _provider = (provider as ethers.Signer).provider ?? new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  } else {
    _provider = provider as Provider;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  async function findBestPathPreferAcyclic(
    amountIn: string | bigint, tokenIn: string, tokenOut: string, maxSteps: number
  ): Promise<PathResult> {
    try {
      const primary = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps);
      if (!hasTokenCycle(primary.path)) return primary;

      for (let steps = maxSteps - 1; steps >= 1; steps--) {
        try {
          const candidate = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, steps);
          if (!hasTokenCycle(candidate.path)) return candidate;
        } catch { /* keep trying */ }
      }
      return primary;
    } catch (err) {
      if (err instanceof EmpxError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new EmpxError(ERROR_CODES.NO_ROUTE_FOUND, msg, true, { tokenIn, tokenOut, maxSteps });
    }
  }

  function buildTradeInfo(
    pathResult: PathResult, slippageBps: number,
    protocolFeeBps: bigint, originalAmountIn: string | bigint
  ): TradeInfo {
    const rawAmountOut = BigInt(pathResult.amounts[pathResult.amounts.length - 1]);
    const amountOut = (rawAmountOut * BigInt(10000 - slippageBps)) / BigInt(10000);

    const affiliateFeeBps = affiliateConfig
      ? affiliateAbsoluteBps(protocolFeeBps, affiliateConfig.feeBps)
      : 0;

    const now = Date.now();
    const ti: TradeInfo = {
      amountIn: originalAmountIn.toString(),
      amountOut: amountOut.toString(),
      fee: protocolFeeBps.toString(),
      affiliateFee: affiliateFeeBps.toString(),
      totalFeeBps: protocolFeeBps.toString(),
      amounts: pathResult.amounts,
      path: pathResult.path,
      adapters: pathResult.adapters,
      gasEstimate: pathResult.gasEstimate,
      quoteId: crypto.randomUUID(),
      timestamp: now,
      validUntil: now + QUOTE_TTL_MS,
      sdkVersion: SDK_VERSION,
    };
    if (integratorId) {
      ti.integratorId = integratorId;
    }
    return ti;
  }

  function buildWrapTradeInfo(amountIn: string | bigint, path: string[]): TradeInfo {
    const now = Date.now();
    const ti: TradeInfo = {
      amountIn: amountIn.toString(), amountOut: amountIn.toString(),
      fee: "0", affiliateFee: "0", totalFeeBps: "0",
      amounts: [amountIn.toString(), amountIn.toString()],
      path, adapters: [], gasEstimate: "0",
      quoteId: crypto.randomUUID(), timestamp: now,
      validUntil: now + QUOTE_TTL_MS, sdkVersion: SDK_VERSION,
    };
    if (integratorId) {
      ti.integratorId = integratorId;
    }
    return ti;
  }

  async function checkAllowanceInternal(
    tokenAddress: string, ownerAddress: string, requiredAmount: string | bigint
  ): Promise<AllowanceResult> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI as ethers.InterfaceAbi, _provider);
    const allowance = await token["allowance"](ownerAddress, chainConfig.ROUTER_ADDRESS);
    return {
      approved: allowance >= BigInt(requiredAmount),
      allowance: allowance.toString(),
    };
  }

  function getFeeBps(
    feeContext?: FeeResolutionContext,
    tokenIn?: string,
    tokenOut?: string,
  ): bigint {
    if (isPairTypeFeesEnabled()) {
      const effectiveCtx: FeeResolutionContext = {
        ...feeContext,
        tokenInIsStable: feeContext?.tokenInIsStable
          ?? (tokenIn ? isStableToken(tokenIn, chainConfig) : undefined),
        tokenOutIsStable: feeContext?.tokenOutIsStable
          ?? (tokenOut ? isStableToken(tokenOut, chainConfig) : undefined),
      };
      const resolved = resolveTieredFeeBps(effectiveCtx);
      if (resolved !== null) return BigInt(resolved);
    }
    return BigInt(getProtocolFeeBps());
  }

  // ─── Calldata helpers (auto-select standard vs integrator ABI) ───────────────

  function buildSwapCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult {
    assertQuoteNotExpired(tradeInfo);
    const fee = tradeInfo.fee;
    if (integratorId) {
      return getAffiliateSwapCalldata(tradeInfo, toAddress, integratorId, chainConfig, fee);
    }
    return getSwapCalldata(tradeInfo, toAddress, chainConfig, fee);
  }

  function buildSwapFromNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult {
    assertQuoteNotExpired(tradeInfo);
    const fee = tradeInfo.fee;
    if (integratorId) {
      return getAffiliateSwapFromNativeCalldata(tradeInfo, toAddress, integratorId, chainConfig, fee);
    }
    return getSwapFromNativeCalldata(tradeInfo, toAddress, chainConfig, fee);
  }

  function buildSwapToNativeCalldata(tradeInfo: TradeInfo, toAddress: string): CalldataResult {
    assertQuoteNotExpired(tradeInfo);
    const fee = tradeInfo.fee;
    if (integratorId) {
      return getAffiliateSwapToNativeCalldata(tradeInfo, toAddress, integratorId, chainConfig, fee);
    }
    return getSwapToNativeCalldata(tradeInfo, toAddress, chainConfig, fee);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  const router: EmpxRouter = {
    chain: chainInfo,
    provider: _provider,
    affiliate: affiliateConfig,
    integratorId,

    isSplitAvailable() {
      return Boolean(chainConfig.MULTICALL_ROUTER_ADDRESS);
    },

    findBestPath(amountIn, tokenIn, tokenOut, maxSteps = 3) {
      return findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps);
    },

    async getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps = 3, slippageBps = 200, feeContext) {
      validateTradeParams({ amountIn, tokenIn, tokenOut, maxSteps, slippageBps, nativeAddress: chainConfig.NATIVE_ADDRESS });
      const feeBps = getFeeBps(feeContext, tokenIn, tokenOut);
      const effectiveAmountIn = applyFee(amountIn, feeBps);

      if (effectiveAmountIn <= BigInt(0)) {
        throw new EmpxError(
          ERROR_CODES.AMOUNT_TOO_SMALL,
          "amountIn is too small after protocol fee deduction",
          false, { amountIn: amountIn.toString(), fee: feeBps.toString() }
        );
      }

      const pathResult = await findBestPathPreferAcyclic(effectiveAmountIn, tokenIn, tokenOut, maxSteps);
      return buildTradeInfo(pathResult, slippageBps, feeBps, amountIn);
    },

    checkAllowance(tokenAddress, ownerAddress, requiredAmount) {
      return checkAllowanceInternal(tokenAddress, ownerAddress, requiredAmount);
    },

    getSwapCalldata(tradeInfo, toAddress) {
      return buildSwapCalldata(tradeInfo, toAddress);
    },

    getSwapFromNativeCalldata(tradeInfo, toAddress) {
      return buildSwapFromNativeCalldata(tradeInfo, toAddress);
    },

    getSwapToNativeCalldata(tradeInfo, toAddress) {
      return buildSwapToNativeCalldata(tradeInfo, toAddress);
    },

    getWrapCalldata(tradeInfo) {
      return getWrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
    },

    getUnwrapCalldata(tradeInfo) {
      return getUnwrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
    },

    getApprovalCalldata(tokenAddress, amount) {
      return getApprovalCalldata(tokenAddress, chainConfig.ROUTER_ADDRESS, amount);
    },

    async swap(amountIn, tokenIn, tokenOut, toAddress, maxSteps = 3, slippageBps = 200, feeContext) {
      validateTradeParams({ amountIn, tokenIn, tokenOut, maxSteps, slippageBps, nativeAddress: chainConfig.NATIVE_ADDRESS });

      const isNativeIn = tokenIn.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase();
      const isNativeOut = tokenOut.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase();
      const isWrappedIn = tokenIn.toLowerCase() === chainConfig.WRAPPED_NATIVE.toLowerCase();
      const isWrappedOut = tokenOut.toLowerCase() === chainConfig.WRAPPED_NATIVE.toLowerCase();
      const feeBps = getFeeBps(feeContext, tokenIn, tokenOut);

      if (isNativeIn && isWrappedOut) {
        const tradeInfo = buildWrapTradeInfo(amountIn, [chainConfig.NATIVE_ADDRESS, chainConfig.WRAPPED_NATIVE]);
        const calldata = getWrapCalldata({ amountIn: tradeInfo.amountIn }, chainConfig.WRAPPED_NATIVE);
        return { tradeInfo, calldata, swapType: "WrapNative" as const };
      }

      if (isWrappedIn && isNativeOut) {
        const tradeInfo = buildWrapTradeInfo(amountIn, [chainConfig.WRAPPED_NATIVE, chainConfig.NATIVE_ADDRESS]);
        const calldata = getUnwrapCalldata({ amountIn: tradeInfo.amountIn }, chainConfig.WRAPPED_NATIVE);
        return { tradeInfo, calldata, swapType: "UnwrapNative" as const };
      }

      const tradeInfo = await router.getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps, slippageBps, feeContext);

      let calldata: CalldataResult;
      let swapType: SwapResult["swapType"];

      if (isNativeIn && !isNativeOut) {
        calldata = buildSwapFromNativeCalldata(tradeInfo, toAddress);
        swapType = "NativeToERC20";
      } else if (!isNativeIn && isNativeOut) {
        calldata = buildSwapToNativeCalldata(tradeInfo, toAddress);
        swapType = "ERC20ToNative";
      } else {
        calldata = buildSwapCalldata(tradeInfo, toAddress);
        swapType = "ERC20ToERC20";
      }

      return { tradeInfo, calldata, swapType };
    },

    getTokenPriceUSD(tokenAddress, maxSteps = 3) {
      return getTokenPriceUSD(_provider, chainConfig, tokenAddress, maxSteps);
    },

    getQuoteUSD(tokenAddress, rawAmount, maxSteps = 3) {
      return getQuoteUSD(_provider, chainConfig, tokenAddress, rawAmount, maxSteps);
    },

    getMultipleTokenPricesUSD(tokenAddresses, maxSteps = 3) {
      return getMultipleTokenPricesUSD(_provider, chainConfig, tokenAddresses, maxSteps);
    },

    getTokenDecimals(tokenAddress) {
      return getTokenDecimals(_provider, chainConfig, tokenAddress);
    },

    getTokenSymbol(tokenAddress) {
      return getTokenSymbol(_provider, chainConfig, tokenAddress);
    },

    async estimateAffiliateEarning(
      tokenAddress: string, rawAmountIn: string | bigint
    ): Promise<AffiliateEarning | null> {
      if (!affiliateConfig) return null;

      const feeBps = getFeeBps();
      const affiliateRaw = calculateAffiliateAmount(rawAmountIn, feeBps, affiliateConfig);

      const decimals = await getTokenDecimals(_provider, chainConfig, tokenAddress);
      const affiliateHuman = Number(affiliateRaw) / 10 ** decimals;

      return {
        affiliateAddress: affiliateConfig.address,
        affiliateAmountRaw: affiliateRaw.toString(),
        affiliateAmountHuman: affiliateHuman,
        affiliateFeeBps: affiliateConfig.feeBps,
      };
    },
  };

  return router;
}

/**
 * Convenience wrapper for V1 compat:
 * createAffiliateRouter(chainId, integratorId, provider?)
 * Calls createRouter() with integratorId set.
 */
export function createAffiliateRouter(
  chainId: number,
  integratorId: string,
  provider?: string | Provider | ethers.Signer
): EmpxRouter {
  validateIntegratorId(integratorId);
  return createRouter(chainId, provider, { integratorId });
}
