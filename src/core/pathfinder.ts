// ─── Pathfinder ───────────────────────────────────────────────────────────────
// Queries the on-chain router for optimal swap paths.
// Chain-agnostic: uses chainConfig.routerAbi for the correct ABI.

import { ethers } from "ethers";
import type { Provider } from "ethers";
import type { ChainConfig, PathResult } from "../types.js";

function resolveToken(address: string, chainConfig: ChainConfig): string {
  return address.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()
    ? chainConfig.WRAPPED_NATIVE
    : address;
}

function validateMaxSteps(maxSteps: number): void {
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 4) {
    throw new Error(`maxSteps must be an integer between 1 and 4. Received: ${maxSteps}`);
  }
}

export async function findBestPath(
  provider: Provider,
  chainConfig: ChainConfig,
  amountIn: string | bigint,
  tokenIn: string,
  tokenOut: string,
  maxSteps = 3
): Promise<PathResult> {
  validateMaxSteps(maxSteps);

  if (!chainConfig.routerAbi) {
    throw new Error(`chainConfig for ${chainConfig.name} is missing routerAbi`);
  }

  const resolvedIn = resolveToken(tokenIn, chainConfig);
  const resolvedOut = resolveToken(tokenOut, chainConfig);
  const amount = BigInt(amountIn);

  const router = new ethers.Contract(
    chainConfig.ROUTER_ADDRESS,
    chainConfig.routerAbi as ethers.InterfaceAbi,
    provider
  );

  try {
    const result = await router["findBestPath"](amount, resolvedIn, resolvedOut, maxSteps);

    return {
      amounts: (result.amounts as bigint[]).map((a) => a.toString()),
      path: [...(result.path as string[])],
      adapters: [...(result.adapters as string[])],
      gasEstimate: result.gasEstimate.toString() as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`findBestPath failed on ${chainConfig.name}: ${msg}`);
  }
}
