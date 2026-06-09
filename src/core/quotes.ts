// ─── Price Quotes ─────────────────────────────────────────────────────────────
import { ethers } from "ethers";
import type { Provider } from "ethers";
import type { ChainConfig, QuoteUSDResult } from "../types.js";
import { findBestPath } from "./pathfinder.js";
import { ERC20_ABI } from "./abi.js";

const _decimalsCache = new Map<string, number>();

export async function getTokenDecimals(
  provider: Provider,
  chainConfig: ChainConfig,
  tokenAddress: string
): Promise<number> {
  if (tokenAddress.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()) {
    return chainConfig.nativeCurrency.decimals;
  }

  const cacheKey = `${chainConfig.chainId}:${tokenAddress.toLowerCase()}`;
  if (_decimalsCache.has(cacheKey)) return _decimalsCache.get(cacheKey)!;

  const contract = new ethers.Contract(tokenAddress, ERC20_ABI as ethers.InterfaceAbi, provider);
  const decimals = await contract["decimals"]();
  _decimalsCache.set(cacheKey, Number(decimals));
  return Number(decimals);
}

export async function getTokenSymbol(
  provider: Provider,
  chainConfig: ChainConfig,
  tokenAddress: string
): Promise<string> {
  if (tokenAddress.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()) {
    return chainConfig.nativeCurrency.symbol;
  }
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI as ethers.InterfaceAbi, provider);
  return contract["symbol"]();
}

export async function getTokenPriceUSD(
  provider: Provider,
  chainConfig: ChainConfig,
  tokenAddress: string,
  maxSteps = 3
): Promise<number> {
  const stableAddress = chainConfig.USD_STABLE;
  const stableDecimals = chainConfig.USD_STABLE_DECIMALS;

  if (tokenAddress.toLowerCase() === stableAddress.toLowerCase()) {
    return 1.0;
  }

  const tokenDecimals = await getTokenDecimals(provider, chainConfig, tokenAddress);
  const oneUnit = BigInt(10) ** BigInt(tokenDecimals);

  const path = await findBestPath(
    provider, chainConfig, oneUnit.toString(),
    tokenAddress, stableAddress, maxSteps
  );

  const rawOut = BigInt(path.amounts[path.amounts.length - 1]);
  return Number(rawOut) / 10 ** stableDecimals;
}

export async function getQuoteUSD(
  provider: Provider,
  chainConfig: ChainConfig,
  tokenAddress: string,
  rawAmount: string | bigint,
  maxSteps = 3
): Promise<QuoteUSDResult> {
  const decimals = await getTokenDecimals(provider, chainConfig, tokenAddress);
  const pricePerToken = await getTokenPriceUSD(provider, chainConfig, tokenAddress, maxSteps);

  const humanAmount = Number(BigInt(rawAmount)) / 10 ** decimals;
  const usd = humanAmount * pricePerToken;

  return {
    usd: parseFloat(usd.toFixed(6)),
    pricePerToken: parseFloat(pricePerToken.toFixed(6)),
    decimals,
    humanAmount: parseFloat(humanAmount.toFixed(decimals)),
  };
}

export async function getMultipleTokenPricesUSD(
  provider: Provider,
  chainConfig: ChainConfig,
  tokenAddresses: string[],
  maxSteps = 3
): Promise<Record<string, number>> {
  const entries = await Promise.allSettled(
    tokenAddresses.map(async (addr) => {
      const price = await getTokenPriceUSD(provider, chainConfig, addr, maxSteps);
      return [addr, price] as [string, number];
    })
  );

  return Object.fromEntries(
    entries
      .filter((r): r is PromiseFulfilledResult<[string, number]> => r.status === "fulfilled")
      .map((r) => r.value)
  );
}
